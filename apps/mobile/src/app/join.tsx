import { JoinFlow } from '../components/JoinFlow';
import { JoinScreen as JoinV2 } from '../v2/screens/JoinScreen';
import { isV2 } from '../v2/theme';

/** /join, and /join?store=<code> from the counter QR (native: <scheme>://join?store=<code>). */
export default function JoinScreen() {
  return isV2 ? <JoinV2 initialMode="join" /> : <JoinFlow initialMode="join" />;
}
