import { useState, useEffect } from "react";
import Link from "next/link";

export default function Drawer({ children, emailLoginHref = "/email" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  return (
    <>
      <button
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="p-2 rounded-md border border-cyan-600/30 hover:border-cyan-500/50 transition-colors"
      >
        <span className="sr-only">Open menu</span>
        <div aria-hidden className="w-6 h-0.5 bg-white mb-1"></div>
        <div aria-hidden className="w-6 h-0.5 bg-white mb-1"></div>
        <div aria-hidden className="w-6 h-0.5 bg-white"></div>
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed z-50 top-0 left-0 h-screen w-72 bg-[#0b1220] border-r border-white/10 transform transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 text-xl font-semibold border-b border-white/10 flex items-center justify-between">
          <span>Slimy Admin</span>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav
          className="px-3 py-2 space-y-1 overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 140px)" }}
        >
          {children}
        </nav>
        <div className="px-3 py-3 mt-auto absolute bottom-0 inset-x-0 border-t border-white/10 bg-[#0a101b]">
          <Link
            href={emailLoginHref}
            className="block text-center py-2 rounded-md bg-gradient-to-r from-fuchsia-600 to-emerald-500 font-semibold hover:from-fuchsia-500 hover:to-emerald-400 transition-all"
          >
            Email Login
          </Link>
        </div>
      </aside>
    </>
  );
}
