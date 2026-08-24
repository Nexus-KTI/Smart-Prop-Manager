type Props = {
  columns: number;
  rows?: number;
};

const WIDTHS = ["72%", "58%", "44%", "50%", "36%", "64%"];

export function TableSkeleton({ columns, rows = 5 }: Props) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} className="skeleton-row" aria-hidden>
          {Array.from({ length: columns }, (_, colIndex) => (
            <td key={colIndex}>
              <span
                className="skeleton-bar"
                style={{ width: WIDTHS[(rowIndex + colIndex) % WIDTHS.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
