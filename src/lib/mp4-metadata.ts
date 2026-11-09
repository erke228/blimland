type Box = { type: string; start: number; end: number };
const invalid = () => new Error('Unsupported or malformed MP4 metadata.');

// Reads container metadata only. This does not decode media or transcode codecs.
export function mp4DurationMs(bytes: Buffer) {
  let budget = 10000;
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    while (start < end) {
      if (--budget < 0 || end - start < 8) throw invalid();
      let size = bytes.readUInt32BE(start),
        header = 8;
      const type = bytes.toString('latin1', start + 4, start + 8);
      if (size === 1) {
        if (end - start < 16) throw invalid();
        const extended = bytes.readBigUInt64BE(start + 8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
        size = Number(extended);
        header = 16;
      } else if (size === 0) size = end - start;
      if (size < header || size > end - start) throw invalid();
      result.push({ type, start: start + header, end: start + size });
      start += size;
    }
    return result;
  }
  const top = boxes(0, bytes.length);
  const ftyp = top.filter((b) => b.type === 'ftyp');
  const moov = top.filter((b) => b.type === 'moov');
  if (
    ftyp.length !== 1 ||
    moov.length !== 1 ||
    !top.some((b) => b.type === 'mdat' && b.end > b.start)
  )
    throw invalid();
  const brand = ftyp[0];
  if (brand.end - brand.start < 8 || (brand.end - brand.start - 8) % 4 !== 0) throw invalid();
  const brands = [bytes.toString('latin1', brand.start, brand.start + 4)];
  for (let offset = brand.start + 8; offset < brand.end; offset += 4)
    brands.push(bytes.toString('latin1', offset, offset + 4));
  if (
    !brands.some((b) =>
      ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].includes(b),
    )
  )
    throw invalid();
  const movie = boxes(moov[0].start, moov[0].end);
  const headers = movie.filter((b) => b.type === 'mvhd');
  if (headers.length !== 1) throw invalid();
  const header = headers[0];
  const version = bytes[header.start];
  if ((version !== 0 && version !== 1) || header.end - header.start < (version === 0 ? 100 : 112))
    throw invalid();
  const timescale = bytes.readUInt32BE(header.start + (version === 0 ? 12 : 20));
  const ticks =
    version === 0
      ? BigInt(bytes.readUInt32BE(header.start + 16))
      : bytes.readBigUInt64BE(header.start + 24);
  if (!timescale || !ticks || ticks > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
  const duration = Math.round((Number(ticks) / timescale) * 1000);
  if (!Number.isSafeInteger(duration) || duration < 1) throw invalid();
  const video = movie
    .filter((b) => b.type === 'trak')
    .some((track) =>
      boxes(track.start, track.end)
        .filter((b) => b.type === 'mdia')
        .some((media) =>
          boxes(media.start, media.end).some(
            (handler) =>
              handler.type === 'hdlr' &&
              handler.end - handler.start >= 24 &&
              bytes.toString('latin1', handler.start + 8, handler.start + 12) === 'vide',
          ),
        ),
    );
  if (!video) throw invalid();
  return duration;
}
