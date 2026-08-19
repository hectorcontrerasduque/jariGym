export function AuthFooter() {
  return (
    <div className="mt-8 text-center text-xs text-gym-muted">
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
