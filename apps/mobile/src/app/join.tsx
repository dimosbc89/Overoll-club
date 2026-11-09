import { JoinFlow } from '../components/JoinFlow';

/** /join, and /join?store=<code> from the counter QR (native: overollclub://join?store=<code>). */
export default function JoinScreen() {
  return <JoinFlow initialMode="join" />;
}
