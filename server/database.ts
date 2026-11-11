// Each request or background job owns its own write batch. Reads stay outside
// the batch so the same transaction semantics work in local SQLite and Sites D1.
export type Query = { sql: string; args: any[] };
export type Driver = {
  rows: (q: Query) => Promise<any[]> | any[];
  first: (q: Query) => Promise<any> | any;
  run: (q: Query) => Promise<{ changes: number }> | { changes: number };
  batch: (queries: Query[]) => Promise<unknown> | unknown;
};
export function connection(driver: Driver) {
  let pending: Query[] | null = null;
  function run(q: Query) {
    if (pending) {
      pending.push(q);
      return { changes: 0 };
    }
    return driver.run(q);
  }
  return {
    prepare(sql: string) {
      const read = (args: any[], first: boolean) => {
        if (pending)
          throw Error("A transaction cannot contain a deferred read");
        return first ? driver.first({ sql, args }) : driver.rows({ sql, args });
      };
      return {
        run: (...args: any[]) => run({ sql, args }),
        get: (...args: any[]) => read(args, true),
        all: (...args: any[]) => read(args, false),
        iterate: (...args: any[]) => read(args, false),
      };
    },
    async exec(command: string) {
      if (command === "BEGIN") {
        if (pending) throw Error("Nested batch");
        pending = [];
        return;
      }
      if (command === "ROLLBACK") {
        pending = null;
        return;
      }
      if (command !== "COMMIT" || !pending)
        throw Error("Unexpected transaction command");
      const writes = pending;
      pending = null;
      if (writes.length) await driver.batch(writes);
    },
    async requireChange(q: Query) {
      if (pending) {
        pending.push(q, {
          sql: "SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'write conflict' END)",
          args: [],
        });
      } else if (!(await driver.run(q)).changes) {
        throw new WriteConflict();
      }
    },
  };
}
export class WriteConflict extends Error {}
export type Database = ReturnType<typeof connection>;
