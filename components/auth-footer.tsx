export function AuthFooter() {
  return (
    <div className="relative w-full py-4 pb-24 md:pb-4 text-center text-xs text-gym-muted bg-gym-surface/50 backdrop-blur-sm border-t border-gym-border/30 mt-auto">
      &copy; {new Date().getFullYear()} Derechos reservados{" "}
      <a
        href="https://hcontrer.org"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gym-primary hover:underline"
      >
        hcontrer.org
      </a>
    </div>
  );
}
