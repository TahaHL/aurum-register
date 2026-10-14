import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  PackagePlus,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { Lot } from "../../shared/types";

import { grams } from "./quote-ui";
import PremiumDialog from "./premium-dialog";
import InventoryDialog from "./inventory-dialog";

export default function InventoryPanel({
  lots,
  search,
  onSearch,
  onChoose,
  role,
  onUpdated,
}: {
  lots: Lot[];
  search: string;
  onSearch: (value: string) => void;
  onChoose: (lot: Lot) => void;
  role: "owner" | "staff";
  onUpdated: () => Promise<void>;
}) {
  const [operation, setOperation] = useState<"receive" | Lot | null>(null);
  const [premiumLot, setPremiumLot] = useState<Lot | null>(null);
  const [success, setSuccess] = useState("");
  function start(next: "receive" | Lot) {
    setSuccess("");
    setOperation(next);
  }
  return (
    <>
      {success && (
        <div className="inventory-success" role="status">
          <Check size={18} />
          {success}
        </div>
      )}
      <section className="panel inventory-panel">
        <div className="section-title inventory-heading">
          <div>
            <h2>Inventory lots</h2>
            <p>Every unit, with its weight, purity and stock position.</p>
          </div>
          <button className="button primary" onClick={() => start("receive")}>
            <PackagePlus size={16} />
            Receive stock
          </button>
        </div>
        <div className="inventory-toolbar">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Search inventory"
              placeholder="Search name or SKU"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
          <span>
            <ShieldCheck size={14} />
            {role === "owner"
              ? "Stock corrections are recorded with your name."
              : "Only the owner can correct existing stock."}
          </span>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="Inventory table"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Lot</th>
                <th>Weight / purity</th>
                <th>Total</th>
                <th>Available</th>
                <th>Reserved</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lots
                .filter((lot) =>
                  (lot.name + " " + lot.sku)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small className="num">{item.sku}</small>
                      <small>
                        Default premium: {item.defaultPremiumBps / 100}%
                      </small>
                    </td>
                    <td>
                      {grams(item.weightMg)}g
                      <small>{(item.fineness / 100).toFixed(2)}% pure</small>
                    </td>
                    <td className="num">{item.totalUnits}</td>
                    <td>
                      <span className="units num">{item.availableUnits}</span>
                    </td>
                    <td className="num">{item.reservedUnits}</td>
                    <td>
                      <div className="inventory-row-actions">
                        <button
                          className="button secondary small"
                          onClick={() => onChoose(item)}
                          disabled={!item.availableUnits}
                        >
                          Quote lot
                          <ArrowUpRight size={14} />
                        </button>
                        {role === "owner" && (
                          <button
                            className="button secondary small"
                            aria-label={`Set premium for ${item.name}`}
                            onClick={() => setPremiumLot(item)}
                          >
                            Premium
                          </button>
                        )}
                        {role === "owner" && (
                          <button
                            className="button secondary small"
                            aria-label={`Correct stock for ${item.name}`}
                            onClick={() => start(item)}
                          >
                            <Settings2 size={14} />
                            Correct
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!lots.filter((lot) =>
            (lot.name + " " + lot.sku)
              .toLowerCase()
              .includes(search.toLowerCase()),
          ).length && <div className="empty">No lots match your search.</div>}
        </div>
      </section>
      {premiumLot && (
        <PremiumDialog
          lot={premiumLot}
          onClose={() => setPremiumLot(null)}
          onSaved={onUpdated}
        />
      )}
      {operation && (
        <InventoryDialog
          lot={
            operation === "receive"
              ? undefined
              : lots.find((lot) => lot.id === operation.id) || operation
          }
          onClose={() => setOperation(null)}
          onSaved={async (message) => {
            await onUpdated();
            setOperation(null);
            setSuccess(message);
          }}
        />
      )}
    </>
  );
}
