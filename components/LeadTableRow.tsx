"use client";

import { useRouter } from "next/navigation";
import { formatCategoryLabel } from "@/lib/format";

type LeadTableRowProps = {
  id: number;
  businessName: string;
  category: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  rating: number | null;
};

export function LeadTableRow({ id, businessName, category, formattedAddress, phoneNumber, rating }: LeadTableRowProps) {
  const router = useRouter();
  const href = `/leads/${id}`;

  function openLead() {
    router.push(href);
  }

  return (
    <tr
      className="clickable-row"
      tabIndex={0}
      onClick={openLead}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLead();
        }
      }}
    >
      <td>{businessName}</td>
      <td>{formatCategoryLabel(category)}</td>
      <td>{formattedAddress || "-"}</td>
      <td className="phone-cell">{phoneNumber || "-"}</td>
      <td>{rating ?? "-"}</td>
    </tr>
  );
}
