import type { DatabaseSync } from "node:sqlite";
import { connection } from "./database.ts";
export function database(sqlite: DatabaseSync) {
  return connection({
    first: ({ sql, args }) => sqlite.prepare(sql).get(...args),
    rows: ({ sql, args }) => sqlite.prepare(sql).all(...args),
    run: ({ sql, args }) => ({
      changes: Number(sqlite.prepare(sql).run(...args).changes),
    }),
    batch(queries) {
      sqlite.exec("BEGIN");
      try {
        for (const { sql, args } of queries) sqlite.prepare(sql).all(...args);
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  });
}
