import dgram from 'dgram';

// NTP timestamp starts at 1900-01-01
const NTP_UNIX_EPOCH_OFFSET_SECONDS = 2208988800;

function ntpTimestampToMs(seconds: number, fraction: number): number {
  // fraction is 32-bit fraction of a second
  const fracMs = Math.round((fraction / 2 ** 32) * 1000);
  return (seconds - NTP_UNIX_EPOCH_OFFSET_SECONDS) * 1000 + fracMs;
}

export async function queryNtpOffsetMs(opts: {
  host: string;
  port?: number;
  timeoutMs?: number;
}): Promise<{ offsetMs: number; serverTimeMs: number }> {
  const port = opts.port ?? 123;
  const timeoutMs = opts.timeoutMs ?? 3000;

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const request = Buffer.alloc(48);

    // LI=0, VN=4, Mode=3 (client) => 0b00 100 011 = 0x23
    request[0] = 0x23;

    const t0 = Date.now();
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {}
      reject(new Error(`NTP timeout após ${timeoutMs}ms (${opts.host}:${port})`));
    }, timeoutMs);

    socket.once('error', (err) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      reject(err);
    });

    socket.once('message', (msg) => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}

      if (!msg || msg.length < 48) {
        reject(new Error('Resposta NTP inválida (tamanho insuficiente)'));
        return;
      }

      // Transmit Timestamp (server send time): bytes 40..47
      const seconds = msg.readUInt32BE(40);
      const fraction = msg.readUInt32BE(44);
      const serverTimeMs = ntpTimestampToMs(seconds, fraction);

      const t1 = Date.now();
      // offset aproximado (sem RTT correction) — suficiente para validação e timestamp
      const midpoint = Math.round((t0 + t1) / 2);
      const offsetMs = serverTimeMs - midpoint;

      resolve({ offsetMs, serverTimeMs });
    });

    socket.send(request, 0, request.length, port, opts.host, (err) => {
      if (err) {
        clearTimeout(timer);
        try {
          socket.close();
        } catch {}
        reject(err);
      }
    });
  });
}

