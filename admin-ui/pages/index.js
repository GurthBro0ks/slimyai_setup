import Head from "next/head";
import Image from "next/image";
import Layout from "../components/Layout";

export default function Home() {
  return (
    <Layout hideSidebar>
      <Head>
        <title>slimy.ai – Admin Panel</title>
      </Head>
      <div className="hero">
        <div className="hero__logo">
          <Image
            src="/slimy-admin-logo.svg"
            alt="slimy admin logo"
            width={96}
            height={96}
            priority
          />
        </div>

        <h1 className="hero__title">slimy.ai – Admin Panel</h1>
        <p className="hero__tagline">
          fueled by <span>adhd</span> — driven by <span>feet</span> — motivated by <span>ducks</span>
        </p>

        <a className="hero__cta" href="/api/auth/login" target="_blank" rel="noopener noreferrer">
          Login with Discord
        </a>
      </div>

      <footer className="hero__footer">
        UI is online on port 3081 behind Caddy.
      </footer>

      <style jsx>{`
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 3.5rem 0 3.25rem;
          gap: 12px;
        }
        .hero__logo {
          margin-bottom: 0.5rem;
          filter: drop-shadow(0 6px 18px rgba(80, 200, 255, 0.25));
        }
        .hero__title {
          margin: 0;
          font-weight: 800;
          line-height: 1.1;
          font-size: 2rem;
          letter-spacing: 0.2px;
          background: linear-gradient(135deg, #60a5fa, #22c55e);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 0 16px rgba(34, 197, 94, 0.08);
        }
        .hero__tagline {
          margin: 0;
          font-size: 1rem;
          opacity: 0.9;
          padding: 0.3rem 0.75rem;
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        }
        .hero__tagline span {
          background: linear-gradient(135deg, #a78bfa, #22c55e);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 0 10px rgba(167, 139, 250, 0.18);
          font-weight: 700;
        }
        .hero__cta {
          display: inline-block;
          padding: 0.75rem 1.25rem;
          border-radius: 12px;
          font-weight: 700;
          text-decoration: none;
          color: #fff;
          background: linear-gradient(135deg, #5865f2, #3ba55d);
          box-shadow: 0 6px 20px rgba(88, 101, 242, 0.35), 0 2px 0 rgba(0, 0, 0, 0.15) inset;
          transition: transform 120ms ease, box-shadow 200ms ease, filter 200ms ease;
        }
        .hero__cta:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
          box-shadow: 0 10px 26px rgba(88, 101, 242, 0.45), 0 2px 0 rgba(0, 0, 0, 0.18) inset;
        }
        .hero__footer {
          margin-top: 48px;
          text-align: center;
          opacity: 0.6;
          font-size: 8pt;
        }
        @media (max-width: 520px) {
          .hero {
            padding-top: 2.5rem;
          }
          .hero__title {
            font-size: 1.7rem;
          }
          .hero__tagline {
            font-size: 0.92rem;
          }
        }
      `}</style>
    </Layout>
  );
}
