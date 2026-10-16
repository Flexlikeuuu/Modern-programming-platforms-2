const { PORT } = require('./src/config');
const { createHttpServer } = require('./src/http-server');
const { initWebSocketServer } = require('./src/ws-handler');

const server = createHttpServer();
initWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
