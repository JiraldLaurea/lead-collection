"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const smeSearchNavItem = {
  href: "/sme-search",
  label: "SME Search",
  icon: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M8 13V9" />
      <path d="M11 13V8" />
      <path d="M14 13v-3" />
    </svg>
  )
};

const navGroups = [
  {
    label: "Dashboards",
    items: [
      {
        href: "/",
        label: "Overview",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 10v10h14V10" />
            <path d="M9 20v-6h6v6" />
          </svg>
        )
      }
    ]
  },
  {
    label: "General",
    items: [
      {
        href: "/leads",
        label: "Leads",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3" />
            <path d="M6 18c0-2.2 1.8-4 4-4h2c2.2 0 4 1.8 4 4" />
            <circle cx="10" cy="8" r="3" />
            <path d="M18 14c1.9.4 3 1.8 3 4" />
          </svg>
        )
      },
      {
        href: "/csv-leads",
        label: "CSV Leads",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4h16v16H4Z" />
            <path d="M4 9h16M9 4v16" />
            <path d="m14 14 2-2 2 2M16 12v5" />
          </svg>
        )
      },
      {
        href: "/compose-email",
        label: "Compose Email",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16v12H4Z" />
            <path d="m4 7 8 6 8-6" />
            <path d="M16 3v6M13 6h6" />
          </svg>
        )
      },
      {
        href: "/send-sms",
        label: "Send SMS",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v11H7l-3 3Z" />
            <path d="m13 9 4 3-4 3" />
            <path d="M7 12h9" />
          </svg>
        )
      },
      {
        href: "/email-log",
        label: "Email Log",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16v12H4Z" />
            <path d="m4 7 8 6 8-6" />
          </svg>
        )
      },
      {
        href: "/sms-log",
        label: "SMS Log",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v11H7l-3 3Z" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
          </svg>
        )
      },
      {
        href: "/settings",
        label: "Settings",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
            <path d="M19.4 15a8 8 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 6h-4l-.4 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 3h4l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a8 8 0 0 0-.2-1Z" />
          </svg>
        )
      },
      {
        href: "/logs/access",
        label: "Logs",
        icon: (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4h12" />
            <path d="M6 8h12" />
            <path d="M6 12h8" />
            <path d="M6 16h10" />
            <path d="M6 20h7" />
          </svg>
        )
      }
    ]
  }
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ smeSearchEnabled = false }: { smeSearchEnabled?: boolean }) {
  const pathname = usePathname();

  const groups = navGroups.map((group) => {
    if (group.label !== "General" || !smeSearchEnabled) return group;
    const leadsIndex = group.items.findIndex((item) => item.href === "/leads");
    const items = [...group.items];
    items.splice(leadsIndex + 1, 0, smeSearchNavItem);
    return { ...group, items };
  });

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">Lead Collection</Link>
      <nav className="sidebar-nav">
        {groups.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
                aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <form action="/api/auth/logout" method="post" className="sidebar-logout sidebar-divider">
        <button className="link-button sidebar-link" type="submit">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 6H5v12h5" />
            <path d="M14 8l4 4-4 4" />
            <path d="M8 12h10" />
          </svg>
          <span>Logout</span>
        </button>
      </form>
    </aside>
  );
}
