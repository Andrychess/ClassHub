function sortPeers(peers) {
  return [...peers].sort((a, b) => {
    if (a.isSelf) {
      return -1;
    }
    if (b.isSelf) {
      return 1;
    }
    if (Boolean(a.hasClassHub) !== Boolean(b.hasClassHub)) {
      return a.hasClassHub ? -1 : 1;
    }
    return a.hostname.localeCompare(b.hostname, "ru");
  });
}

module.exports = { sortPeers };
