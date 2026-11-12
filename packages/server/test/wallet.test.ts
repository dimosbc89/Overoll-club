import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import forge from 'node-forge';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AppleSetup,
  type WalletDesign,
  type WalletServices,
  appleAuthToken,
  appleSerialsUpdatedSince,
  applePassForDevice,
  createApplePassSigner,
  crc32,
  loadWalletPass,
  registerAppleDevice,
  unregisterAppleDevice,
  walletAppleDownload,
  walletAppleLink,
  walletGoogleLink,
  walletUpdates,
  zipStored,
} from '../src/index.js';
import { type TestDatabase, createTestDatabase } from './helpers/db.js';
import { type TestMember, givePoints, newMember, seedWorld } from './helpers/world.js';

// ----------------------------------------------------------------- fixtures

/** A throwaway CA (stands in for Apple WWDR) and a "Pass Type ID" certificate it signed, as a .p12. */
function testCertificates(passTypeId: string, teamId: string) {
  const caKeys = forge.pki.rsa.generateKeyPair(2048);
  const ca = forge.pki.createCertificate();
  ca.publicKey = caKeys.publicKey;
  ca.serialNumber = '01';
  ca.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  ca.validity.notAfter = new Date('2031-01-01T00:00:00Z');
  const caName = [{ name: 'commonName', value: 'Test WWDR' }];
  ca.setSubject(caName);
  ca.setIssuer(caName);
  ca.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true, digitalSignature: true }]);
  ca.sign(caKeys.privateKey, forge.md.sha256.create());

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-12-01T00:00:00Z');
  cert.setSubject([
    { type: '0.9.2342.19200300.100.1.1', value: passTypeId },
    { name: 'commonName', value: `Pass Type ID: ${passTypeId}` },
    { shortName: 'OU', value: teamId },
  ]);
  cert.setIssuer(caName);
  cert.sign(caKeys.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'secret-pass', { algorithm: '3des' });
  return {
    p12Base64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()),
    caPem: forge.pki.certificateToPem(ca),
  };
}

/** Read a stored or deflated ZIP into its files. */
function unzip(data: Uint8Array): Record<string, Buffer> {
  const buf = Buffer.from(data);
  const files: Record<string, Buffer> = {};
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const method = buf.readUInt16LE(at + 8);
    const size = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const start = at + 30 + nameLength + extra;
    const raw = buf.subarray(start, start + size);
    files[name] = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    at = start + size;
  }
  return files;
}

const png = (label: string) => new TextEncoder().encode(`png:${label}`);

const design: WalletDesign = {
  slug: 'overoll',
  programName: 'Test Club',
  siteUrl: 'https://club.example.gr',
  supportEmail: 'hello@example.gr',
  colors: { background: '#026852', foreground: '#f8f1de', label: '#ffc93c' },
  tiers: {
    classic: { el: 'Κλασικό', en: 'Classic' },
    gold: { el: 'Χρυσό', en: 'Gold' },
    club: { el: 'Κλαμπ', en: 'Club' },
  },
  copy: {
    el: JSON.parse(readFileSync(new URL('../../../data/copy/wallet.el.json', import.meta.url), 'utf8')),
    en: JSON.parse(readFileSync(new URL('../../../data/copy/wallet.en.json', import.meta.url), 'utf8')),
  },
  appleImages: { 'icon.png': png('icon'), 'icon@2x.png': png('icon2'), 'logo.png': png('logo') },
  googleLogoUrl: 'https://club.example.gr/wallet/logo.png',
};

const PASS_TYPE = 'pass.online.example.test';
const TEAM = 'TEAM123456';

let db: TestDatabase;
let certs: ReturnType<typeof testCertificates>;
let services: WalletServices;
let pushed: string[][];
let googleCalls: { url: string; method: string; body: string }[];
let googlePublicKey: CryptoKey;
let member: TestMember;

beforeAll(async () => {
  db = await createTestDatabase();
  await seedWorld(db.admin);
  certs = testCertificates(PASS_TYPE, TEAM);
  const signer = createApplePassSigner(forge, { p12Base64: certs.p12Base64, password: 'secret-pass', wwdrPem: certs.caPem });
  const apple: AppleSetup = {
    passTypeId: PASS_TYPE,
    teamId: TEAM,
    webServiceUrl: 'https://ref.supabase.co/functions/v1/api/wallet/apple',
    sign: (m) => signer.sign(m),
  };
  const googleKeys = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  googlePublicKey = googleKeys.publicKey;
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', googleKeys.privateKey)).toString('base64');
  pushed = [];
  googleCalls = [];
  services = {
    designs: { overoll: design },
    apple,
    google: {
      issuerId: '3388000000000000001',
      serviceAccount: { client_email: 'wallet@test.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n` },
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        googleCalls.push({ url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? '') });
        if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
        return new Response('{}', { status: String(url).includes('missing') ? 404 : 200 });
      }) as typeof fetch,
    },
    async pushApple(tokens) {
      pushed.push([...tokens]);
      return { unregistered: tokens.filter((t) => t.startsWith('gone')) };
    },
  };
  member = await newMember(db.server, db.admin, { firstName: 'Ελένη' });
  await givePoints(db.admin, member.memberId, 420);
}, 120_000);

afterAll(async () => {
  await db?.drop();
});

// -------------------------------------------------------------------- tests

describe('zip', () => {
  it('writes stored entries any unzip can read, with correct CRCs', () => {
    const data = zipStored([
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'el.lproj/pass.strings', data: new TextEncoder().encode('"κ" = "ν";') },
    ]);
    const files = unzip(data);
    expect(files['a.txt']!.toString()).toBe('hello');
    expect(files['el.lproj/pass.strings']!.toString()).toBe('"κ" = "ν";');
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('Apple pass certificate', () => {
  it('reads the Pass Type ID and team from the .p12', () => {
    const signer = createApplePassSigner(forge, { p12Base64: certs.p12Base64, password: 'secret-pass', wwdrPem: certs.caPem });
    expect(signer.passTypeId).toBe(PASS_TYPE);
    expect(signer.teamId).toBe(TEAM);
    expect(signer.privateKeyPem).toContain('PRIVATE KEY');
  });

  it('refuses a wrong password', () => {
    expect(() => createApplePassSigner(forge, { p12Base64: certs.p12Base64, password: 'nope', wwdrPem: certs.caPem })).toThrow();
  });
});

describe('Apple Wallet pass', () => {
  async function download() {
    const link = await walletAppleLink(db.server, { callerUserId: member.userId }, services);
    if (!link.ok) throw new Error(link.code);
    const token = link.url.split('/download/')[1]!;
    const file = await walletAppleDownload(db.server, token, services);
    if (file.kind !== 'pass') throw new Error(file.kind);
    return { link, token, files: unzip(file.pkpass), file };
  }

  it('gives a signed member card with points, tier, name and the Wallet QR', async () => {
    const { link, files } = await download();
    expect(link.url).toMatch(/^https:\/\/ref\.supabase\.co\/functions\/v1\/api\/wallet\/apple\/download\//);
    const pass = JSON.parse(files['pass.json']!.toString());
    expect(pass).toMatchObject({
      formatVersion: 1,
      passTypeIdentifier: PASS_TYPE,
      teamIdentifier: TEAM,
      serialNumber: member.memberId,
      organizationName: expect.any(String),
      description: 'Test Club',
      webServiceURL: 'https://ref.supabase.co/functions/v1/api/wallet/apple',
      backgroundColor: 'rgb(2, 104, 82)',
      sharingProhibited: true,
    });
    expect(pass.authenticationToken).toHaveLength(40);
    expect(pass.storeCard.primaryFields[0]).toMatchObject({ key: 'points', value: 420, label: 'label.points' });
    expect(pass.storeCard.headerFields[0]).toMatchObject({ key: 'tier', value: 'tier.classic' });
    expect(pass.storeCard.secondaryFields[0]).toMatchObject({ key: 'member', value: 'Ελένη' });
    // 420 points: the croissant (500) is next.
    expect(pass.storeCard.auxiliaryFields[0].value).toMatch(/^reward\./);
    expect(pass.barcodes[0]).toMatchObject({ format: 'PKBarcodeFormatQR', message: expect.stringMatching(/^OCW\./) });
    expect(pass.barcodes[0].altText).toBe(member.memberCode.replace(/(.{4})(?=.)/g, '$1 '));

    const el = files['el.lproj/pass.strings']!.toString();
    const en = files['en.lproj/pass.strings']!.toString();
    expect(el).toContain('"label.points" = "ΠΟΝΤΟΙ";');
    expect(en).toContain('"label.points" = "POINTS";');
    expect(el).toContain('"tier.classic" = "Κλασικό";');
    expect(el).toContain('"back.rewards" = "Τα δώρα σου τα εξαργυρώνεις στο club.example.gr.";');
    expect(en).toContain('"change.points" = "Your points are now %@.";');
    expect(el).toContain('= "Κρουασάν";');
    expect(en).toContain('= "Croissant";');
    expect(files['icon.png']!.toString()).toBe('png:icon');
  });

  it('lists every file in the manifest with its SHA-1, and signs the manifest', async () => {
    const { files } = await download();
    const manifest = JSON.parse(files['manifest.json']!.toString()) as Record<string, string>;
    const names = Object.keys(files).filter((n) => n !== 'manifest.json' && n !== 'signature').sort();
    expect(Object.keys(manifest).sort()).toEqual(names);
    for (const name of names) expect(manifest[name]).toBe(createHash('sha1').update(files[name]!).digest('hex'));

    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(files['signature']!.toString('binary'))) as forge.pkcs7.PkcsSignedData & {
      rawCapture: { authenticatedAttributes: forge.asn1.Asn1[]; signature: string };
    };
    expect(p7.certificates).toHaveLength(2);
    // The digest in the signed attributes is the manifest's SHA-256…
    const digestAttr = p7.rawCapture.authenticatedAttributes.find(
      (a) => forge.asn1.derToOid((a.value as forge.asn1.Asn1[])[0]!.value as string) === forge.pki.oids.messageDigest,
    )!;
    const digest = ((digestAttr.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!.value as string;
    expect(Buffer.from(digest, 'binary').toString('hex')).toBe(createHash('sha256').update(files['manifest.json']!).digest('hex'));
    // …and the signature over those attributes verifies with the pass certificate.
    const attrs = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, p7.rawCapture.authenticatedAttributes);
    const md = forge.md.sha256.create();
    md.update(forge.asn1.toDer(attrs).getBytes());
    const signerCert = p7.certificates.find((c) => c.subject.getField('CN')?.value?.startsWith('Pass Type ID'))!;
    expect((signerCert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().getBytes(), p7.rawCapture.signature)).toBe(true);
  });

  it('passes OpenSSL verification of the detached signature, when OpenSSL is there', async () => {
    let hasOpenssl = true;
    try {
      execFileSync('openssl', ['version'], { stdio: 'ignore' });
    } catch {
      hasOpenssl = false;
    }
    if (!hasOpenssl) return;
    const { files } = await download();
    const dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
    writeFileSync(join(dir, 'manifest.json'), files['manifest.json']!);
    writeFileSync(join(dir, 'signature'), files['signature']!);
    writeFileSync(join(dir, 'ca.pem'), certs.caPem);
    const out = execFileSync(
      'openssl',
      ['cms', '-verify', '-binary', '-inform', 'DER', '-in', join(dir, 'signature'), '-content', join(dir, 'manifest.json'),
        '-CAfile', join(dir, 'ca.pem'), '-purpose', 'any', '-out', '/dev/null'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    expect(out).toBeDefined();
  });

  it('refuses tampered and expired download links', async () => {
    const { token } = await download();
    const [id, exp, sig] = token.split('.');
    expect((await walletAppleDownload(db.server, `${id}.${exp}.${'0'.repeat(32)}`, services)).kind).toBe('not_found');
    expect((await walletAppleDownload(db.server, `${id}.${Number(exp) + 1}.${sig}`, services)).kind).toBe('not_found');
    expect((await walletAppleDownload(db.server, token, services, new Date(Date.now() + 11 * 60_000))).kind).toBe('expired');
    expect((await walletAppleDownload(db.server, 'nonsense', services)).kind).toBe('not_found');
  });

  it('answers not_configured without the certificate, and member_not_found for a non-member', async () => {
    expect(await walletAppleLink(db.server, { callerUserId: member.userId }, { designs: { overoll: design } })).toMatchObject({
      ok: false,
      code: 'not_configured',
    });
    expect(await walletAppleLink(db.server, { callerUserId: '00000000-0000-0000-0000-0000000000f1' }, services)).toMatchObject({
      ok: false,
      code: 'member_not_found',
    });
    expect(await walletAppleLink(db.server, { callerUserId: 'x' }, services)).toMatchObject({ ok: false, code: 'invalid_input' });
  });
});

describe('PassKit web service', () => {
  it('registers a device only with the pass token, lists changed passes and serves the latest pass', async () => {
    const pass = (await loadWalletPass(db.server, member.memberId))!;
    const token = await appleAuthToken(pass);
    const device = { deviceLibraryId: 'device-1', passTypeId: PASS_TYPE, serial: member.memberId };

    expect(await registerAppleDevice(db.server, { ...device, pushToken: 'push-1', authToken: 'wrong' }, services)).toBe(401);
    expect(await registerAppleDevice(db.server, { ...device, passTypeId: 'pass.other', pushToken: 'push-1', authToken: token }, services)).toBe(401);
    expect(await registerAppleDevice(db.server, { ...device, pushToken: 'push 1!', authToken: token }, services)).toBe(400);
    expect(await registerAppleDevice(db.server, { ...device, pushToken: 'push-1', authToken: token }, services)).toBe(201);
    expect(await registerAppleDevice(db.server, { ...device, pushToken: 'push-1b', authToken: token }, services)).toBe(200);

    const all = await appleSerialsUpdatedSince(db.server, { deviceLibraryId: 'device-1', passTypeId: PASS_TYPE, since: null }, services);
    expect(all?.serialNumbers).toEqual([member.memberId]);
    expect(await appleSerialsUpdatedSince(db.server, { deviceLibraryId: 'device-1', passTypeId: PASS_TYPE, since: all!.lastUpdated }, services)).toBeNull();
    expect(await appleSerialsUpdatedSince(db.server, { deviceLibraryId: 'other', passTypeId: PASS_TYPE, since: null }, services)).toBeNull();

    const latest = await applePassForDevice(db.server, { passTypeId: PASS_TYPE, serial: member.memberId, authToken: token, ifModifiedSince: null }, services);
    expect(latest.kind).toBe('pass');
    const lastModified = (latest as { lastModified: Date }).lastModified.toUTCString();
    expect(
      (await applePassForDevice(db.server, { passTypeId: PASS_TYPE, serial: member.memberId, authToken: token, ifModifiedSince: lastModified }, services)).kind,
    ).toBe('not_modified');
    expect(
      (await applePassForDevice(db.server, { passTypeId: PASS_TYPE, serial: member.memberId, authToken: 'nope', ifModifiedSince: null }, services)).kind,
    ).toBe('unauthorized');

    // New points: the pass is listed again.
    await new Promise((r) => setTimeout(r, 5));
    await givePoints(db.admin, member.memberId, 10);
    const changed = await appleSerialsUpdatedSince(db.server, { deviceLibraryId: 'device-1', passTypeId: PASS_TYPE, since: all!.lastUpdated }, services);
    expect(changed?.serialNumbers).toEqual([member.memberId]);

    expect(await unregisterAppleDevice(db.server, { ...device, authToken: 'nope' }, services)).toBe(401);
    expect(await unregisterAppleDevice(db.server, { ...device, authToken: token }, services)).toBe(200);
    expect(await appleSerialsUpdatedSince(db.server, { deviceLibraryId: 'device-1', passTypeId: PASS_TYPE, since: null }, services)).toBeNull();
  });
});

describe('Google Wallet', () => {
  it('signs a save link that creates the class and the member object', async () => {
    const link = await walletGoogleLink(db.server, { callerUserId: member.userId }, services);
    if (!link.ok) throw new Error(link.code);
    expect(link.url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    const jwt = link.url.split('/save/')[1]!;
    const [head, body, sig] = jwt.split('.');
    const verified = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      googlePublicKey,
      Buffer.from(sig!, 'base64url'),
      new TextEncoder().encode(`${head}.${body}`),
    );
    expect(verified).toBe(true);
    const claims = JSON.parse(Buffer.from(body!, 'base64url').toString());
    expect(claims).toMatchObject({ iss: 'wallet@test.iam.gserviceaccount.com', aud: 'google', typ: 'savetowallet', origins: ['https://club.example.gr'] });
    const cls = claims.payload.loyaltyClasses[0];
    const obj = claims.payload.loyaltyObjects[0];
    expect(cls).toMatchObject({ id: '3388000000000000001.overoll-club', programName: 'Test Club', hexBackgroundColor: '#026852' });
    expect(obj).toMatchObject({
      id: `3388000000000000001.overoll-${member.memberId}`,
      classId: cls.id,
      accountId: member.memberCode,
      accountName: 'Ελένη',
      barcode: { type: 'QR_CODE', value: expect.stringMatching(/^OCW\./) },
    });
    expect(obj.loyaltyPoints.localizedLabel.translatedValues[0]).toEqual({ language: 'en', value: 'POINTS' });
    const [row] = await db.admin<{ google_wallet_at: Date | null }[]>`
      select google_wallet_at from public.member_secrets where member_id = ${member.memberId}
    `;
    expect(row!.google_wallet_at).not.toBeNull();
  });
});

describe('jobs/wallet-updates', () => {
  it('pushes to Apple devices and updates Google once per change, and drops tokens Apple refuses', async () => {
    const other = await newMember(db.server, db.admin, { firstName: 'Νίκος' });
    const pass = (await loadWalletPass(db.server, member.memberId))!;
    const token = await appleAuthToken(pass);
    await registerAppleDevice(db.server, { deviceLibraryId: 'phone', passTypeId: PASS_TYPE, serial: member.memberId, pushToken: 'push-ok', authToken: token }, services);
    await registerAppleDevice(db.server, { deviceLibraryId: 'old-phone', passTypeId: PASS_TYPE, serial: member.memberId, pushToken: 'gone-1', authToken: token }, services);

    pushed = [];
    googleCalls = [];
    const first = await walletUpdates(db.server, services);
    expect(first).toMatchObject({ ok: true, failed: 0 });
    expect(pushed).toEqual([expect.arrayContaining(['push-ok', 'gone-1'])]);
    expect(first.applePushes).toBe(1);
    expect(googleCalls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(googleCalls.find((c) => c.method === 'PATCH')!.body).toContain('"balance":{"int":430}');
    const devices = await db.admin<{ push_token: string }[]>`select push_token from public.wallet_apple_devices where member_id = ${member.memberId}`;
    expect(devices.map((d) => d.push_token)).toEqual(['push-ok']);

    // Nothing changed: nothing sent. A member without a pass is never looked at.
    pushed = [];
    googleCalls = [];
    expect(await walletUpdates(db.server, services)).toMatchObject({ members: 0 });
    await givePoints(db.admin, other.memberId, 50);
    expect(await walletUpdates(db.server, services)).toMatchObject({ members: 0 });
    expect(pushed).toEqual([]);

    // New points: sent again.
    await givePoints(db.admin, member.memberId, 15);
    expect(await walletUpdates(db.server, services)).toMatchObject({ members: 1, applePushes: 1, googleUpdates: 1 });
  });
});
