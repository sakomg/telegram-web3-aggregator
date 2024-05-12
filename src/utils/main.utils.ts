function normalizeUsername(username: string) {
  if (username.startsWith('@')) return username;
  else return `@${username}`;
}

function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

export { normalizeUsername, delay };
