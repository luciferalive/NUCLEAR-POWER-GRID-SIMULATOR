import { MIN_PER_DAY, addLedger, clamp, log } from "../util.js";
import { nextRandom } from "../rng.js";
import { projectAction, startProject } from "./construction.js";
import { ITEM_PRICE } from "./data.js";
import { WAREHOUSE_CAP } from "./world.js";
export const quotePrice = (s, supplierId, item, qty) => {
    const w = s.world, p = w.suppliers.find((x) => x.id === supplierId);
    const fx = p.country === "Meridia" ? 1 : w.econ.fx, rel = 1 + (70 - p.relation) / 250, vol = qty >= 50 ? 0.95 : qty >= 20 ? 0.98 : 1;
    return Math.round(ITEM_PRICE[item] * p.priceMul * w.econ.cpi * fx * rel * vol * (item === "materials" ? Math.sqrt(w.econ.construction) : 1));
};
export const warehouseFree = (s, item) => {
    const w = s.world, cap = WAREHOUSE_CAP[item] * (1 + (item === "spares" || item === "components" ? w.buildings.warehouse : 0));
    return Math.max(0, cap - (s.inventory[item] ?? 0) - w.orders.filter((o) => o.status === "transit" && o.item === item).reduce((a, o) => a + o.qty, 0));
};
export function worldDispatch(s, a) {
    const w = s.world, f = s.finance, ok = (msg) => ({ ok: true, msg }), no = (msg) => ({ ok: false, msg });
    const afford = (x) => f.cash >= x || s.settings.mode === "sandbox";
    switch (a.c) {
        case "quote": {
            const p = w.suppliers.find((x) => x.id === a.supplierId);
            if (!p)
                return no("Unknown supplier");
            const q = Math.floor(a.qty);
            if (q < 1)
                return no("Enter a quantity");
            if (!p.categories.includes(a.item))
                return no(`${p.name} does not sell that`);
            if ((p.stock[a.item] ?? 0) < q)
                return no(`${p.name} only has ${p.stock[a.item] ?? 0} in stock`);
            if (q > warehouseFree(s, a.item))
                return no(`Warehouse space: only ${warehouseFree(s, a.item)} more can be stored (build a warehouse extension)`);
            const id = "Q-" + (w.quotes.length + 1 + Math.floor(s.t / 60));
            w.quotes.push({ id, supplierId: p.id, item: a.item, qty: q, unitPrice: quotePrice(s, p.id, a.item, q), leadDays: Math.max(1, Math.round(p.leadDays * (0.9 + nextRandom(s) * 0.3))), terms: p.terms, expiresT: s.t + 10 * MIN_PER_DAY, ordered: false });
            if (w.quotes.length > 40)
                w.quotes.shift();
            addLedger(s, "administration", -150, "Quotation request");
            return ok("Quotation received");
        }
        case "order": {
            const q = w.quotes.find((x) => x.id === a.quoteId);
            if (!q || q.ordered)
                return no("Quotation not available");
            if (s.t > q.expiresT)
                return no("Quotation expired: request a new one");
            const p = w.suppliers.find((x) => x.id === q.supplierId);
            if ((p.stock[q.item] ?? 0) < q.qty)
                return no("Supplier stock changed: request a new quotation");
            if (q.qty > warehouseFree(s, q.item))
                return no("Not enough warehouse space");
            p.stock[q.item] -= q.qty;
            q.ordered = true;
            const id = "PO-" + (w.orders.length + 1 + Math.floor(s.t / 30));
            w.orders.push({ id, supplierId: p.id, item: q.item, qty: q.qty, unitPrice: q.unitPrice, placedT: s.t, dueT: s.t + q.leadDays * MIN_PER_DAY, eta: s.t + q.leadDays * MIN_PER_DAY, status: "transit", terms: q.terms, delayed: false, invoiceId: "P-" + id });
            log(s, "info", "procurement", `Purchase order ${id} placed with ${p.name}.`);
            return ok(`Order ${id} placed`);
        }
        case "cancelOrder": {
            const o = w.orders.find((x) => x.id === a.id && x.status === "transit");
            if (!o)
                return no("Order cannot be cancelled");
            o.status = "cancelled";
            const p = w.suppliers.find((x) => x.id === o.supplierId);
            p.stock[o.item] += o.qty;
            p.relation = clamp(p.relation - 4, 0, 100);
            addLedger(s, "administration", -o.qty * o.unitPrice * 0.1, `Cancellation fee ${o.id}`);
            return ok("Order cancelled (10 % fee)");
        }
        case "pay": {
            const p = w.payables.find((x) => x.id === a.id && !x.paid);
            if (!p)
                return no("Nothing to pay");
            if (!afford(p.amount))
                return no("Not enough cash");
            f.cash -= p.amount;
            p.paid = true;
            p.paidT = s.t;
            const sup = w.suppliers.find((x) => x.id === p.supplierId);
            sup.relation = clamp(sup.relation + 1.5, 0, 100);
            return ok("Invoice paid");
        }
        case "negotiate": {
            const p = w.suppliers.find((x) => x.id === a.supplierId);
            if (!p)
                return no("Unknown supplier");
            const k = "neg:" + p.id;
            if (s.t - (w.flags[k] ?? -1e9) < 20 * MIN_PER_DAY)
                return no("You negotiated recently: wait 20 days");
            w.flags[k] = s.t;
            addLedger(s, "administration", -4000, `Negotiation with ${p.name}`);
            if (nextRandom(s) < 0.25 + p.relation / 200 + (s.staff.some((e) => e.role === "finance") ? 0.1 : 0)) {
                p.priceMul = Math.max(0.75, p.priceMul * 0.96);
                return ok(`${p.name} agrees to a 4 % lower price`);
            }
            p.relation = clamp(p.relation - 2, 0, 100);
            return ok(`${p.name} refuses to move on price`);
        }
        case "project": {
            const e = startProject(s, a);
            return e ? no(e) : ok("Project submitted for approval");
        }
        case "projectCtl": {
            const e = projectAction(s, a.id, a.what);
            return e ? no(e) : ok();
        }
        case "battery": {
            const b = w.batteries.find((x) => x.id === a.id);
            if (!b)
                return no("Unknown battery");
            b.mode = a.mode;
            return ok();
        }
        case "gen": {
            const g = w.ownGen.find((x) => x.id === a.id);
            if (!g)
                return no("Unknown plant");
            g.online = a.online;
            return ok();
        }
        case "repairLine": {
            const l = w.lines.find((x) => x.id === a.id);
            if (!l || l.status !== "fault")
                return no("Line is not faulty");
            const cost = 120_000 * w.econ.cpi;
            if (!afford(cost))
                return no("Not enough cash");
            addLedger(s, "facility-maintenance", -cost, `Rush repair ${l.id}`);
            l.faultUntil = s.t;
            return ok("Rush repair ordered");
        }
        case "maintainLine": {
            const l = w.lines.find((x) => x.id === a.id);
            if (!l || l.status === "planned")
                return no("Not available");
            const cost = 70_000 * w.econ.cpi;
            if (!afford(cost))
                return no("Not enough cash");
            addLedger(s, "facility-maintenance", -cost, `Line maintenance ${l.id}`);
            l.condition = 100;
            return ok("Line maintained");
        }
        case "budget":
            w.flags.maintBudget = clamp(a.maint, 0.6, 1.4);
            return ok(a.maint < 1 ? "Maintenance budget cut: cheaper now, more wear and failures later" : a.maint > 1 ? "Maintenance budget raised" : "Normal maintenance budget");
        case "admin":
            w.flags.adminLevel = clamp(Math.round(a.level), 0, 2);
            return ok(a.level === 0 ? "Lean administration: cheaper, but reporting suffers" : "Administration level set");
        case "contractor":
            w.flags.contractor = clamp(Math.round(a.n), 0, 2);
            return ok("Maintenance contractor changed");
        case "fileReport": {
            if (w.reg.reportFiled)
                return no("Report already filed this month");
            if (!afford(12_000))
                return no("Not enough cash");
            addLedger(s, "compliance", -12_000, "Financial report filing");
            w.reg.reportFiled = true;
            w.reg.reporting = clamp(w.reg.reporting + 6, 0, 100);
            return ok("Financial report filed");
        }
        case "shipWaste": {
            const u = Math.min(Math.floor(a.units), Math.floor(w.reg.wasteStored));
            if (u < 1)
                return no("No waste to ship");
            const cost = u * 18_000 * w.econ.cpi;
            if (!afford(cost))
                return no("Not enough cash");
            addLedger(s, "waste", -cost * 0.7, "Waste treatment and disposal");
            addLedger(s, "transportation", -cost * 0.3, "Waste transport");
            w.reg.wasteStored -= u;
            return ok(`Shipped ${u} units of waste`);
        }
        case "refinance": {
            if (!f.loans.length)
                return no("No loans to refinance");
            const target = Math.max(0.03, w.econ.interest + 0.01), avg = f.loans.reduce((x, l) => x + l.rate * l.principal, 0) / Math.max(1, f.debt);
            if (target > avg - 0.003)
                return no(`Not worth it: market rate ${(target * 100).toFixed(1)} % vs your ${(avg * 100).toFixed(1)} %`);
            const fee = f.debt * 0.01;
            if (!afford(fee))
                return no("Not enough cash for the fee");
            addLedger(s, "interest", -fee, "Refinancing fee");
            for (const l of f.loans)
                l.rate = target;
            return ok(`Loans refinanced at ${(target * 100).toFixed(1)} %`);
        }
    }
}
