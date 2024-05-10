function normalizeUsername(username: string) {
  if (username.startsWith('@')) return username;
  else return `@${username}`;
}

export { normalizeUsername };
