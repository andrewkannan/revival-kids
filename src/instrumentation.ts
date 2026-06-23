export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmailCron } = await import('./lib/cron');
    startEmailCron();
  }
}
