type TableStatusRowProps = {
  colSpan: number;
  itemCount: number;
  selectedCount: number;
  itemLabel?: string;
};

export function TableStatusRow({ colSpan, itemCount, selectedCount, itemLabel = "item" }: TableStatusRowProps) {
  return (
    <tr className="table-status-row">
      <th colSpan={colSpan}>
        <div className="table-status-content">
          <span>{itemCount} {itemLabel}{itemCount === 1 ? "" : "s"} &bull; {selectedCount} selected</span>
        </div>
      </th>
    </tr>
  );
}
