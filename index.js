const { startRecordsService } = require('./services/records');
const { startCommentsService } = require('./services/comments');
const { startMonitoringService } = require('./services/monitoring');
const { startGateway } = require('./gateway');

async function main() {
  console.log('Запуск сервисов...');
  try {
    const records = await startRecordsService(4001);
    const comments = await startCommentsService(4002);
    const monitoring = await startMonitoringService(4003);
    const gateway = await startGateway(4000);

    console.log('Система готова: http://localhost:4000/');

    const shutdown = async () => {
      console.log('Остановка...');
      if (gateway.listener) gateway.listener.close();
      await gateway.server.stop();
      await records.server.stop();
      await comments.server.stop();
      await monitoring.server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Ошибка:', err);
    process.exit(1);
  }
}

main();
