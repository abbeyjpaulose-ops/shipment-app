import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import GeneratedInvoice from '../models/NewShipment/NewShipmentGeneratedInvoice.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';

export async function syncPaymentsFromGeneratedInvoices(gstinId, clientIds = null, options = {}) {
  if (!Number.isFinite(gstinId)) {
    throw new Error('Invalid GSTIN_ID');
  }

  const preserveStatus = Boolean(options.preserveStatus);
  const direction = 'receivable';
  const clientFilter = Array.isArray(clientIds)
    ? clientIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null;

  const invoiceQuery = {
    GSTIN_ID: gstinId,
    status: { $nin: ['cancelled', 'deleted'] }
  };
  if (clientFilter && clientFilter.length) {
    invoiceQuery.billingClientId = { $in: clientFilter };
  }

  const invoices = await GeneratedInvoice.find(invoiceQuery).lean();

  const totalsByClient = new Map();
  if (clientFilter && clientFilter.length) {
    clientFilter.forEach((id) => totalsByClient.set(id, 0));
  }

  const consignmentNumbers = Array.from(
    new Set(
      invoices.flatMap((inv) =>
        (inv.consignments || []).map((c) => String(c?.consignmentNumber || '').trim())
      ).filter(Boolean)
    )
  );

  const shipments = consignmentNumbers.length
    ? await Shipment.find({
        GSTIN_ID: gstinId,
        consignmentNumber: { $in: consignmentNumbers }
      }).select('consignmentNumber finalAmount').lean()
    : [];

  const shipmentTotals = new Map(
    shipments.map((s) => [String(s.consignmentNumber), Number(s.finalAmount || 0)])
  );

  invoices.forEach((inv) => {
    const clientId = String(inv.billingClientId || '').trim();
    if (!clientId) return;
    const total = (inv.consignments || []).reduce((sum, c) => {
      const num = String(c?.consignmentNumber || '').trim();
      return sum + (shipmentTotals.get(num) || 0);
    }, 0);
    totalsByClient.set(clientId, (totalsByClient.get(clientId) || 0) + total);
  });

  const clientIdsToUpdate = Array.from(totalsByClient.keys());
  if (!clientIdsToUpdate.length) {
    return { entities: 0 };
  }

  const existingSummaries = await PaymentEntitySummary.find({
    GSTIN_ID: gstinId,
    entityType: 'client',
    entityId: { $in: clientIdsToUpdate },
    direction: { $in: [direction, null] }
  }).lean();

  const summariesById = new Map(
    existingSummaries.map((s) => [String(s.entityId), s])
  );

  const summaryOps = clientIdsToUpdate.map((id) => {
    const totalDue = Number(totalsByClient.get(id) || 0);
    const existing = summariesById.get(String(id));
    const totalPaid = Number(existing?.totalPaid || 0);
    const totalBalance = Math.max(totalDue - totalPaid, 0);
    const status = totalBalance <= 0 ? 'Paid' : 'Pending';
    const setPayload = preserveStatus
      ? { totalDue, totalPaid, totalBalance }
      : { totalDue, totalPaid, totalBalance, status };
    setPayload.direction = direction;
    return {
      updateOne: {
        filter: {
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: id,
          direction: { $in: [direction, null] }
        },
        update: {
          $set: setPayload
        },
        upsert: true
      }
    };
  });

  if (summaryOps.length) {
    await PaymentEntitySummary.bulkWrite(summaryOps);
  }

  const existingPayments = await Payment.find({
    GSTIN_ID: gstinId,
    entityType: 'client',
    entityId: { $in: clientIdsToUpdate },
    direction: { $in: [direction, null] }
  }).lean();

  const paymentsById = new Map(existingPayments.map((p) => [String(p.entityId), p]));

  const paymentOps = clientIdsToUpdate.map((id) => {
    const totalDue = Number(totalsByClient.get(id) || 0);
    const existing = paymentsById.get(String(id));
    const amountPaid = Number(existing?.amountPaid || 0);
    const balance = Math.max(totalDue - amountPaid, 0);
    const status = balance <= 0 ? 'Paid' : 'Pending';
    const setPayload = preserveStatus
      ? { amountDue: totalDue, amountPaid, balance }
      : { amountDue: totalDue, amountPaid, balance, status };
    setPayload.direction = direction;
    return {
      updateOne: {
        filter: {
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: id,
          direction: { $in: [direction, null] }
        },
        update: {
          $set: setPayload
        },
        upsert: true
      }
    };
  });

  if (paymentOps.length) {
    await Payment.bulkWrite(paymentOps);
  }

  return { entities: clientIdsToUpdate.length };
}
