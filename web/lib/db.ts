import mysql, { type Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var qprintPool: Pool | undefined;
}

export const db = globalThis.qprintPool ?? mysql.createPool({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE ?? "qprint_db",
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
  decimalNumbers: false,
  timezone: "Z",
});

if (process.env.NODE_ENV !== "production") globalThis.qprintPool = db;
