import { JoinFlow } from '../components/JoinFlow';

/** Existing members: the same one-time-code step as joining (copy deck §a). */
export default function SignInScreen() {
  return <JoinFlow initialMode="signin" />;
}
