/**
 * Signs Apple Wallet passes with the brand's Pass Type ID certificate.
 *
 * node-forge is passed in rather than imported, like `postgres` in the Edge
 * Function: the Function's entry file imports it as an npm: specifier (it
 * needs the Deno runtime's Node compatibility), tests import it from npm.
 *
 * The certificate comes as the .p12 exported from Keychain Access (base64)
 * with its password; Apple's WWDR intermediate (G4) is public and lives in the
 * repo (data/wallet/apple-wwdr-g4.pem).
 */
import type forgeType from 'node-forge';

type Forge = typeof forgeType;

export interface ApplePassCertificate {
  p12Base64: string;
  password: string;
  wwdrPem: string;
}

export interface ApplePassSigner {
  /** Detached PKCS #7 (CMS) signature, SHA-256, with the WWDR certificate included. */
  sign(manifest: Uint8Array): Uint8Array;
  /** From the certificate subject: UID = Pass Type ID, OU = team id. */
  passTypeId: string | null;
  teamId: string | null;
  notAfter: Date;
  /** PEM of the certificate and key, for APNs (pass update pushes use the same certificate). */
  certificatePem: string;
  privateKeyPem: string;
}

export function createApplePassSigner(forge: Forge, input: ApplePassCertificate): ApplePassSigner {
  const der = forge.util.decode64(input.p12Base64.replace(/\s+/g, ''));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), input.password);

  const oids = forge.pki.oids;
  const bags = (type: string) => p12.getBags({ bagType: type })[type] ?? [];
  const certBags = bags(oids.certBag!);
  const keyBags = [...bags(oids.pkcs8ShroudedKeyBag!), ...bags(oids.keyBag!)];
  const rsaKey = keyBags.find((b) => b.key)?.key as forgeType.pki.rsa.PrivateKey | undefined;
  if (!rsaKey) throw new Error('Pass certificate: no private key in the .p12');
  // The certificate that goes with the key (a .p12 may also carry the chain).
  const certificate = certBags
    .map((b) => b.cert)
    .find((c): c is forgeType.pki.Certificate => !!c && (c.publicKey as forgeType.pki.rsa.PublicKey).n.equals(rsaKey.n));
  if (!certificate) throw new Error('Pass certificate: no certificate for the private key in the .p12');
  const wwdr = forge.pki.certificateFromPem(input.wwdrPem);

  const field = (shortOrOid: string) => {
    const attr = certificate.subject.attributes.find((a: forgeType.pki.CertificateField) => a.shortName === shortOrOid || a.type === shortOrOid || a.name === shortOrOid);
    return typeof attr?.value === 'string' ? attr.value : null;
  };

  return {
    passTypeId: field('0.9.2342.19200300.100.1.1') ?? field('UID'),
    teamId: field('OU'),
    notAfter: certificate.validity.notAfter,
    certificatePem: forge.pki.certificateToPem(certificate),
    privateKeyPem: forge.pki.privateKeyToPem(rsaKey),
    sign(manifest: Uint8Array): Uint8Array {
      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(forge.util.binary.raw.encode(manifest));
      p7.addCertificate(certificate);
      p7.addCertificate(wwdr);
      p7.addSigner({
        key: rsaKey,
        certificate,
        digestAlgorithm: forge.pki.oids.sha256!,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
          { type: forge.pki.oids.messageDigest! },
          { type: forge.pki.oids.signingTime!, value: new Date() as unknown as string },
        ],
      });
      p7.sign({ detached: true });
      return forge.util.binary.raw.decode(forge.asn1.toDer(p7.toAsn1()).getBytes());
    },
  };
}
