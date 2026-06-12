import type { DbKind } from '@kamehadb/shared';
import { PostgreSQL, MySQL, MongoDB, Redis, MicrosoftSQLServer, Oracle, ClickHouse, MariaDB } from 'developer-icons';
import duckdbLogo from '/duckdb.svg';
import qdrantLogo from '/qdrant.svg';
import sqliteLogo from '/sqlite.svg';
import tigerbeetleLogo from '/tigerbeetle.svg';

type DbIconProps = {
  kind: DbKind;
  className?: string;
};

export function DbIcon({ kind, className = 'size-5' }: DbIconProps) {
  const Icon = icons[kind];
  if (!Icon) return null;
  return <Icon className={className} />;
}

const size = 20;

// Local SVG logos (DuckDB / SQLite / TigerBeetle) have no packaged
// developer-icons equivalent, so we render them from /public as <img>
// tags. Browsers strip SVG fill via CSS, so we leave the official palette
// intact and let the parent color override only for monochrome cases.
const Img = (src: string) => (props: { className?: string }) => (
  <img src={src} alt="" aria-hidden className={props.className} />
);

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  postgres: (props) => <PostgreSQL size={size} className={props.className} />,
  mysql: (props) => <MySQL size={size} className={props.className} />,
  sqlite: Img(sqliteLogo),
  redis: (props) => <Redis size={size} className={props.className} />,
  mongodb: (props) => <MongoDB size={size} className={props.className} />,
  qdrant: Img(qdrantLogo),
  tigerbeetle: Img(tigerbeetleLogo),
  sqlserver: (props) => <MicrosoftSQLServer size={size} className={props.className} />,
  oracle: (props) => <Oracle size={size} className={props.className} />,
  clickhouse: (props) => <ClickHouse size={size} className={props.className} />,
  mariadb: (props) => <MariaDB size={size} className={props.className} />,
  duckdb: Img(duckdbLogo),
};
