import "../styles/globals.css";
import { SessionProvider } from "../lib/session";

export default function SlimyAdminApp({ Component, pageProps }) {
  return (
    <SessionProvider>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
