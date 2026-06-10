"use client";

import { useState } from "react";

export type DashboardMetricCardData = {
  label: string;
  value: number;
  footer: string;
  iconPaths: string[];
};

type DashboardMetricTabsProps = {
  dailyCards: DashboardMetricCardData[];
  totalCards: DashboardMetricCardData[];
};

export function DashboardMetricTabs({ dailyCards, totalCards }: DashboardMetricTabsProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "total">("daily");
  const cards = activeTab === "daily" ? dailyCards : totalCards;

  return (
    <>
      <div className="dashboard-tabs" role="tablist" aria-label="Dashboard metric range">
        <button className={activeTab === "daily" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "daily"} onClick={() => setActiveTab("daily")}>
          Daily
        </button>
        <button className={activeTab === "total" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "total"} onClick={() => setActiveTab("total")}>
          Total
        </button>
      </div>
      <div className="dashboard-metric-grid">
        {cards.map((card) => (
          <DashboardMetricCard key={card.label} {...card} />
        ))}
      </div>
    </>
  );
}

function DashboardMetricCard({ label, value, footer, iconPaths }: DashboardMetricCardData) {
  return (
    <article className="dashboard-metric-card">
      <div className="dashboard-metric-body">
        <span className="dashboard-metric-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            {iconPaths.map((path, index) => (
              <path d={path} key={`${path}-${index}`} />
            ))}
          </svg>
        </span>
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      </div>
      <div className="dashboard-metric-footer">{footer}</div>
    </article>
  );
}
