import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, LifeBuoy, Lock, MessageSquare, Plus, Send, ShieldAlert } from 'lucide-react';
import type {
  RoleCode,
  SupportTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '../core/types';
import { apiFetch } from '../lib/apiClient';

interface SupportTicketsViewProps {
  userId: string;
  userRole: RoleCode;
}

interface AssigneeOption {
  id: string;
  full_name: string;
  role: string;
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  incident: 'Incident technique',
  demande: 'Demande de service',
  acces: 'Accès & Comptes',
  materiel: 'Matériel',
  logiciel: 'Logiciel & Factorealm',
  autre: 'Autre',
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  critique: 'Critique',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  en_attente: 'En attente',
  resolu: 'Résolu',
  ferme: 'Fermé',
};

function priorityClass(priority: TicketPriority): string {
  switch (priority) {
    case 'critique':
      return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300';
    case 'haute':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300';
    case 'normale':
      return 'bg-blue-50 text-[#0066FF] dark:bg-blue-950/50 dark:text-blue-300';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

function statusClass(status: TicketStatus): string {
  switch (status) {
    case 'resolu':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300';
    case 'ferme':
      return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    case 'en_cours':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300';
    case 'en_attente':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300';
    default:
      return 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300';
  }
}

export function SupportTicketsView({ userId, userRole }: SupportTicketsViewProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'tous' | TicketStatus>('tous');
  const [searchQuery, setSearchQuery] = useState('');

  // Formulaire nouveau ticket
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('incident');
  const [newPriority, setNewPriority] = useState<TicketPriority>('normale');
  const [newDescription, setNewDescription] = useState('');

  // Détail / actions
  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canManage = userRole === 'admin' || userRole === 'gestionnaire';

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ tickets: SupportTicket[]; assignees: AssigneeOption[] }>('/tickets');
      setTickets(data.tickets);
      setAssignees(data.assignees);
      setSelectedId((prev) => prev ?? data.tickets[0]?.id ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== 'tous' && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.requesterName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeTicket =
    tickets.find((t) => t.id === selectedId) ?? filteredTickets[0] ?? null;

  useEffect(() => {
    if (activeTicket) {
      setResolutionDraft(activeTicket.resolutionNote ?? '');
    }
  }, [activeTicket?.id]);

  const openCount = tickets.filter((t) => t.status === 'ouvert' || t.status === 'en_cours').length;
  const criticalCount = tickets.filter(
    (t) => (t.priority === 'critique' || t.priority === 'haute') && t.status !== 'resolu' && t.status !== 'ferme',
  ).length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolu' || t.status === 'ferme').length;

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      const created = await apiFetch<SupportTicket>('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle,
          category: newCategory,
          priority: newPriority,
          description: newDescription,
        }),
      });
      setNewTitle('');
      setNewDescription('');
      setShowCreate(false);
      setInfo(`Ticket ${created.ticketNumber} créé.`);
      setSelectedId(created.id);
      await loadTickets();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handlePatchTicket(patch: Record<string, unknown>, msg: string) {
    if (!activeTicket) return;
    setError(null);
    setInfo(null);
    try {
      await apiFetch<SupportTicket>(`/tickets/${activeTicket.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setInfo(msg);
      await loadTickets();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTicket || !commentBody.trim()) return;
    setError(null);
    try {
      await apiFetch<SupportTicket>(`/tickets/${activeTicket.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody, isInternal: canManage && commentInternal }),
      });
      setCommentBody('');
      setCommentInternal(false);
      await loadTickets();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#081C3A] dark:text-white">
            Support & Tickets informatiques
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Déclaration d'incidents, demandes d'accès, assignation et suivi interne numéroté (TCK-AAAA-XXXX)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-[#0066FF] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? 'Fermer le formulaire' : 'Nouveau ticket IT'}
        </button>
      </div>

      {/* Synthèse KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Tickets actifs</span>
            <Clock className="h-4 w-4 text-[#0066FF]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#081C3A] dark:text-white">
            {openCount}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Priorité haute / critique</span>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#081C3A] dark:text-white">
            {criticalCount}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Résolus & fermés</span>
            <CheckCircle2 className="h-4 w-4 text-[#2DBE8D]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#081C3A] dark:text-white">
            {resolvedCount}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {info}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreateTicket}
          className="rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]"
        >
          <h2 className="font-display text-base font-bold text-[#081C3A] dark:text-white">
            Ouvrir un nouveau ticket informatique
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label htmlFor="tck-title" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Objet du ticket *
              </label>
              <input
                id="tck-title"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex. Erreur imprimante réseau ou création accès comptable"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="tck-cat" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Catégorie
              </label>
              <select
                id="tck-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TicketCategory)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tck-prio" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Priorité
              </label>
              <select
                id="tck-prio"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="tck-desc" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Description détaillée (contexte, poste concerné, message d'erreur)
            </label>
            <textarea
              id="tck-desc"
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Décrivez le symptôme ou la demande..."
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#0066FF] px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Créer le ticket
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Liste des tickets */}
        <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#0D1B2E]">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Filtrer les tickets par numéro ou titre"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un ticket (TCK-..., mot-clé)..."
              className="flex-1 min-w-[180px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select
              aria-label="Filtrer par statut de ticket"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'tous' | TicketStatus)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="tous">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Chargement des tickets...</p>
          ) : filteredTickets.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <LifeBuoy className="h-8 w-8 mx-auto text-slate-400" />
              <p className="text-sm text-slate-500">Aucun ticket informatique trouvé.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTickets.map((t) => {
                const selected = activeTicket?.id === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left p-3 rounded-md transition-colors ${
                        selected
                          ? 'bg-blue-50/80 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#0066FF]">{t.ticketNumber}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${priorityClass(t.priority)}`}>
                            {PRIORITY_LABELS[t.priority]}
                          </span>
                          <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${statusClass(t.status)}`}>
                            {STATUS_LABELS[t.status]}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-[#081C3A] dark:text-white">{t.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {CATEGORY_LABELS[t.category]} · Par {t.requesterName}
                        {t.assigneeName ? ` · Assigné à ${t.assigneeName}` : ' · Non assigné'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Détail & Fil d'échanges */}
        <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#0D1B2E]">
          {!activeTicket ? (
            <p className="py-12 text-center text-sm text-slate-500">
              Sélectionnez un ticket pour consulter les échanges et le traiter.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0066FF]">
                    {activeTicket.ticketNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    Créé le {activeTicket.createdAt.slice(0, 10)}
                  </span>
                </div>
                <h2 className="mt-1 font-display text-lg font-bold text-[#081C3A] dark:text-white">
                  {activeTicket.title}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Demandeur : <strong>{activeTicket.requesterName}</strong> · Catégorie :{' '}
                  {CATEGORY_LABELS[activeTicket.category]}
                </p>
                {activeTicket.description && (
                  <p className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {activeTicket.description}
                  </p>
                )}
              </div>

              {canManage ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div>
                    <label htmlFor="det-status" className="block text-[11px] font-semibold text-slate-500">
                      Statut
                    </label>
                    <select
                      id="det-status"
                      value={activeTicket.status}
                      onChange={(e) => handlePatchTicket({ status: e.target.value }, 'Statut mis à jour.')}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {Object.entries(STATUS_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="det-prio" className="block text-[11px] font-semibold text-slate-500">
                      Priorité
                    </label>
                    <select
                      id="det-prio"
                      value={activeTicket.priority}
                      onChange={(e) => handlePatchTicket({ priority: e.target.value }, 'Priorité mise à jour.')}
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="det-assignee" className="block text-[11px] font-semibold text-slate-500">
                      Technicien assigné
                    </label>
                    <select
                      id="det-assignee"
                      value={activeTicket.assigneeUserId ?? ''}
                      onChange={(e) =>
                        handlePatchTicket(
                          { assigneeUserId: e.target.value || null },
                          'Assignation mise à jour.',
                        )
                      }
                      className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">Non assigné</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name} ({a.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3 flex gap-2">
                    <input
                      aria-label="Note de résolution IT"
                      value={resolutionDraft}
                      onChange={(e) => setResolutionDraft(e.target.value)}
                      placeholder="Résumé technique de la résolution..."
                      className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handlePatchTicket(
                          { resolutionNote: resolutionDraft, status: 'resolu' },
                          'Ticket marqué résolu.',
                        )
                      }
                      className="rounded bg-[#2DBE8D] px-3 py-1.5 text-xs font-semibold text-[#081C3A] hover:bg-emerald-400 whitespace-nowrap"
                    >
                      Marquer résolu
                    </button>
                  </div>
                </div>
              ) : (
                activeTicket.requesterUserId === userId && (
                  <div className="flex justify-end">
                    {activeTicket.status !== 'ferme' ? (
                      <button
                        type="button"
                        onClick={() => handlePatchTicket({ status: 'ferme' }, 'Ticket fermé.')}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        Fermer mon ticket
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePatchTicket({ status: 'ouvert' }, 'Ticket réouvert.')}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
                      >
                        Réouvrir le ticket
                      </button>
                    )}
                  </div>
                )
              )}

              {activeTicket.resolutionNote && (
                <div className="rounded border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <strong>Note de résolution :</strong> {activeTicket.resolutionNote}
                </div>
              )}

              {/* Fil de commentaires */}
              <div className="space-y-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Échanges ({activeTicket.comments.length})
                </h3>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {activeTicket.comments.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucun commentaire pour le moment.</p>
                  ) : (
                    activeTicket.comments.map((c) => (
                      <div
                        key={c.id}
                        className={`rounded-md border p-3 text-xs ${
                          c.isInternal
                            ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20'
                            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-[#081C3A] dark:text-slate-200">
                            {c.authorName}
                            {c.isInternal && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950 dark:bg-amber-900/60 dark:text-amber-200">
                                <Lock className="h-2.5 w-2.5" />
                                Note interne IT
                              </span>
                            )}
                          </span>
                          <span className="font-mono">{c.createdAt.slice(0, 16).replace('T', ' ')}</span>
                        </div>
                        <p className="mt-1.5 text-slate-800 whitespace-pre-wrap dark:text-slate-100">{c.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <textarea
                    aria-label="Ajouter un commentaire sur le ticket"
                    rows={2}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Répondre au ticket ou préciser un diagnostic..."
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {canManage ? (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={commentInternal}
                          onChange={(e) => setCommentInternal(e.target.checked)}
                        />
                        Note interne (visible uniquement au support IT)
                      </label>
                    ) : (
                      <span />
                    )}
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#0066FF] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Envoyer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
