// Only application-owned SQL is accepted; user values always remain parameters.
export function postgresSql(input: string) {
  const ignore = /^\s*INSERT OR IGNORE\b/i.test(input);
  const sql = input.replace(/^\s*INSERT OR IGNORE\b/i, 'INSERT');
  let result = '',
    quote = '',
    parameter = 0;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index];
    if (quote) {
      result += char;
      if (char === quote) {
        if (sql[index + 1] === quote) result += sql[++index];
        else quote = '';
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else result += char === '?' ? `$${++parameter}` : char;
  }
  return ignore ? result.trim().replace(/;$/, '') + ' ON CONFLICT DO NOTHING' : result;
}
