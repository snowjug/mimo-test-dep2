/** Company and support details shown under the sign-in forms. */
export function AuthFooter() {
  return (
    <footer className="mt-auto pb-[max(20px,env(safe-area-inset-bottom))] pt-12 text-center text-[12px] leading-relaxed text-ink-3">
      <p className="font-medium text-ink-2">Vision Printt Technologies</p>
      <p>REVA NEST, Rukmini Knowledge Park, Kattegenahalli, Yelahanka, Bengaluru 560064</p>
      <p className="mt-1">
        Support{" "}
        <a href="tel:+918123028797" className="font-medium text-brand-text">
          +91 81230 28797
        </a>
        , Mon to Fri, 9 AM to 6 PM IST
      </p>
      <p className="mt-2">© 2026 VASUDEVA VISHAL (Vision Printt Technologies). All rights reserved.</p>
    </footer>
  );
}
