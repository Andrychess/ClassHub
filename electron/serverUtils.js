function listenOn(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0", () => resolve(server));
    server.on("error", reject);
  });
}

function closeServer(server) {
  if (!server) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

module.exports = { listenOn, closeServer };
