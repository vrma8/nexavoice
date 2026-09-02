"use client";

import React, { useState, useEffect } from "react";
import { CaseItem } from "@/types";
import { Users, Filter, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Search, ChevronRight } from "lucide-react";

interface CasesHubProps {
  onSelectCase?: (caseItem: CaseItem) => void;
}

export const CasesHub: React.FC<CasesHubProps> = ({ onSelectCase }) => {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCases = async () => {
    setLoading(true);
    try {
      const url = filterStatus === "ALL" ? "http://localhost:8000/api/cases" : `http://localhost:8000/api/cases?status=${filterStatus}`;
      const res = await fetch(url);
      const data = await res.json();
      setCases(data);
    } catch (err) {
      console.error("Failed to load cases", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [filterStatus]);

  const handleAccept = async (caseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`http://localhost:8000/api/cases/${caseId}/accept`, { method: "POST" });
      fetchCases();
    } catch (err) {
      console.error("Error accepting case", err);
    }
  };

  const filteredCases = cases.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(query) ||
      (c.summary && c.summary.toLowerCase().includes(query)) ||
      (c.category && c.category.toLowerCase().includes(query)) ||
      (c.escalation_reason && c.escalation_reason.toLowerCase().includes(query))
    );
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Controls */}
      <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Support Cases & Escalation Hub
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage caller inquiries, verified details, and officer handoffs
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cases..."
              className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="WAITING_FOR_HUMAN">Waiting for Human</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* Cases Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Case ID</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Priority</th>
                <th className="py-3.5 px-4">Summary & Reason</th>
                <th className="py-3.5 px-4">Confidence</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    Loading support cases...
                  </td>
                </tr>
              ) : filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    No cases match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const isUrgent = c.status === "WAITING_FOR_HUMAN";
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectCase && onSelectCase(c)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-300">
                        {c.id.slice(0, 8)}...
                      </td>
                      <td className="py-3.5 px-4 capitalize text-slate-200">
                        {c.category.replace("_", " ")}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            c.priority === "URGENT" || c.priority === "HIGH"
                              ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                              : "bg-amber-500/20 text-amber-400 border-amber-500/40"
                          }`}
                        >
                          {c.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-slate-200 truncate">{c.summary}</p>
                        {c.escalation_reason && (
                          <span className="text-[10px] text-rose-400">
                            Reason: {c.escalation_reason.replace("_", " ")}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold">
                        <span
                          className={
                            c.confidence >= 0.8 ? "text-emerald-400" : c.confidence >= 0.55 ? "text-amber-400" : "text-rose-400"
                          }
                        >
                          {Math.round(c.confidence * 100)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            isUrgent
                              ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                              : c.status === "ASSIGNED"
                              ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {c.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {c.status === "WAITING_FOR_HUMAN" ? (
                          <button
                            onClick={(e) => handleAccept(c.id, e)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] shadow-sm"
                          >
                            Accept Case
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">{c.assigned_agent_name || "Assigned"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
