export function AuthFooter() {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 text-center text-xs text-gym-muted z-10">
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
