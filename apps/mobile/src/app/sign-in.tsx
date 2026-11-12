import { JoinFlow } from '../components/JoinFlow';
import { JoinScreen as JoinV2 } from '../v2/screens/JoinScreen';
import { isV2 } from '../v2/theme';

/** Existing members: the same one-time-code step as joining (copy deck §a). */
export default function SignInScreen() {
  return isV2 ? <JoinV2 initialMode="signin" /> : <JoinFlow initialMode="signin" />;
}
