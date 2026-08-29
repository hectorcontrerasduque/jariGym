const { lint } = require('next/dist/cli/next-lint'); // eslint-disable-line @typescript-eslint/no-require-imports

async function runLint() {
  try {
    await lint({
      dir: process.cwd(),
    });
    console.log('✅ Lint completado exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lint falló:', error.message);
    process.exit(1);
  }
}

runLint();