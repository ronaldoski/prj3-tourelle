import * as SQLite from 'expo-sqlite';

// ===================== TYPES =====================
export interface HistoryRecord {
  id: number;
  timestamp: Date;
  angle?: number;
  distance?: number;
  temperature?: number;
  humidity?: number;
  weatherCondition?: string;
}

// ===================== SINGLETON DB =====================
let _db: SQLite.SQLiteDatabase | null = null;

const getDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('missile_history.db');
  await _db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp        TEXT    NOT NULL,
      angle            REAL,
      distance         REAL,
      temperature      REAL,
      humidity         REAL,
      weatherCondition TEXT
    );
  `);
  return _db;
};

// ===================== SAVE =====================
export const saveHistory = async (
  data: Omit<HistoryRecord, 'id'>
): Promise<number> => {
  const db = await getDb();
  const ts =
    data.timestamp instanceof Date
      ? data.timestamp.toISOString()
      : new Date(data.timestamp).toISOString();

  const result = await db.runAsync(
    `INSERT INTO history (timestamp, angle, distance, temperature, humidity, weatherCondition)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      ts,
      data.angle  ?? null,
      data.distance    ?? null,
      data.temperature ?? null,
      data.humidity    ?? null,
      data.weatherCondition ?? null,
    ]
  );
  return result.lastInsertRowId;
};

// ===================== GET LIST =====================
export const getHistory = async (limit = 100): Promise<HistoryRecord[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    timestamp: string;
    angle: number | null;
    distance: number | null;
    temperature: number | null;
    humidity: number | null;
    weatherCondition: string | null;
  }>(
    'SELECT * FROM history ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
  return rows.map(r => ({
    id: r.id,
    timestamp: new Date(r.timestamp),
    angle:            r.angle            ?? undefined,
    distance:         r.distance         ?? undefined,
    temperature:      r.temperature      ?? undefined,
    humidity:         r.humidity         ?? undefined,
    weatherCondition: r.weatherCondition ?? undefined,
  }));
};

// ===================== GET CHART DATA (7 derniers jours) =====================
export const getHistoryForChart = async (days = 7) => {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db.getAllAsync<{
    timestamp: string;
    angle: number | null;
    distance: number | null;
    temperature: number | null;
  }>(
    `SELECT timestamp, angle, distance, temperature
     FROM history
     WHERE timestamp >= ?
     ORDER BY timestamp ASC`,
    [cutoff.toISOString()]
  );

  return {
    labels: rows.map(r => {
      const d = new Date(r.timestamp);
      return `${d.getHours()}h${d.getMinutes().toString().padStart(2, '0')}`;
    }),
    angleData:    rows.map(r => r.angle       ?? 0),
    distanceData: rows.map(r => r.distance    ?? 0),
    tempData:     rows.map(r => r.temperature ?? 0),
  };
};

// ===================== EXPORT CSV =====================
export const exportToCsv = async (): Promise<string> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    timestamp: string;
    angle: number | null;
    distance: number | null;
    temperature: number | null;
    humidity: number | null;
    weatherCondition: string | null;
  }>('SELECT * FROM history ORDER BY timestamp DESC');

  const header = 'id,timestamp,angle_deg,distance_cm,temperature_c,humidity_pct,weatherCondition';
  const lines = rows.map(r =>
    [
      r.id,
      r.timestamp,
      r.angle            ?? '',
      r.distance         ?? '',
      r.temperature      ?? '',
      r.humidity         ?? '',
      r.weatherCondition ?? '',
    ].join(',')
  );
  return [header, ...lines].join('\n');
};
