// Container metadata fixture only; dummy mdat bytes cannot be decoded as a video.
export function mp4Fixture(durationMs = 53000, version: 0 | 1 = 0, handler = 'vide') {
  function box(type: string, body: Buffer) {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(body.length + 8);
    header.write(type, 4, 4, 'latin1');
    return Buffer.concat([header, body]);
  }
  const movie = Buffer.alloc(version === 0 ? 100 : 112);
  movie[0] = version;
  movie.writeUInt32BE(1000, version === 0 ? 12 : 20);
  if (version === 0) movie.writeUInt32BE(durationMs, 16);
  else movie.writeBigUInt64BE(BigInt(durationMs), 24);
  const hdlr = Buffer.alloc(24);
  hdlr.write(handler, 8, 4, 'latin1');
  return Buffer.concat([
    box('ftyp', Buffer.from('isom\x00\x00\x00\x00mp42', 'latin1')),
    box('moov', Buffer.concat([box('mvhd', movie), box('trak', box('mdia', box('hdlr', hdlr)))])),
    box('mdat', Buffer.alloc(16)),
  ]);
}
