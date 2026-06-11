const paypalSvc     = require('../../services/paypal/paypal');
const CoursePayment = require('../../database/models/CoursePayment.model');
const Subscription  = require('../../database/models/Subscription.model');
const tenantRepo    = require('../../database/repositories/tenant.repository');
const logger        = require('../../utils/logger');

async function handleWebhook(req, res) {
  // Verify signature (skipped in mock mode)
  let verified;
  try {
    verified = await paypalSvc.verifyWebhookSignature(req.headers, req.body);
  } catch (err) {
    logger.warn(`[paypal.webhook] Signature verification error: ${err.message}`);
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  if (!verified) {
    logger.warn('[paypal.webhook] Invalid PayPal webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const eventType = body.event_type;

  try {
    if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      // Buyer approved the order — auto-capture as backup (frontend capture is primary)
      const orderId = body.resource?.id;
      if (orderId) {
        const payment = await CoursePayment.findOne({ paypalOrderId: orderId, status: 'pending' });
        if (payment) {
          const paymentSvc = require('../payment/payment.service');
          await paymentSvc.capturePaypalPayment(payment.tenantId, payment._id, payment.userId);
          logger.info(`[paypal.webhook] Auto-captured order ${orderId}`);
        }
      }
    } else if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      // Store capture ID on the payment record if not already set (webhook may arrive
      // before the sync capture response is written by capturePaypalPayment).
      const captureId = body.resource?.id;
      const orderId   = body.resource?.supplementary_data?.related_ids?.order_id;
      if (captureId && orderId) {
        await CoursePayment.updateOne(
          { paypalOrderId: orderId, paypalCaptureId: null },
          { $set: { paypalCaptureId: captureId } }
        );
      }
      logger.info(`[paypal.webhook] Capture completed: ${captureId}`);

    } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
      const orderId = body.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        await CoursePayment.updateOne(
          { paypalOrderId: orderId, status: 'pending' },
          { $set: { status: 'failed' } }
        );
        logger.info(`[paypal.webhook] Capture denied for order ${orderId}`);
      }

    } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      const orderId = body.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        const payment = await CoursePayment.findOne({ paypalOrderId: orderId, status: 'completed' });
        if (payment) {
          payment.status     = 'refunded';
          payment.refundedAt = new Date();
          await payment.save();

          const { Enrollment } = require('../../database/models');
          const Course = require('../../database/models/Course.model');
          await Promise.all([
            Enrollment.updateOne({ _id: payment.enrollmentId }, { status: 'dropped', droppedAt: new Date() }),
            Course.updateOne({ _id: payment.courseId, tenantId: payment.tenantId }, { $inc: { enrollmentCount: -1 } }),
          ]);
          logger.info(`[paypal.webhook] Refund processed for order ${orderId}`);
        }
      }

    } else if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const subscriptionId = body.resource?.id;
      const planId         = body.resource?.plan_id;
      const tenantId       = body.resource?.custom_id; // set at subscription creation if needed
      logger.info(`[paypal.webhook] Subscription activated: ${subscriptionId} plan=${planId}`);
      // Mark tenant subscription as active if tenantId was embedded
      if (tenantId) {
        try {
          await tenantRepo.updateById(tenantId, { status: 'active' });
          await Subscription.updateOne(
            { tenantId, paypalSubscriptionId: subscriptionId },
            { $set: { status: 'active' } }
          );
        } catch (e) {
          logger.warn(`[paypal.webhook] Could not update tenant from SUBSCRIPTION.ACTIVATED: ${e.message}`);
        }
      }

    } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      const subscriptionId = body.resource?.id;
      logger.info(`[paypal.webhook] Subscription cancelled: ${subscriptionId}`);
      try {
        await Subscription.updateOne(
          { paypalSubscriptionId: subscriptionId },
          { $set: { status: 'cancelled', cancelledAt: new Date() } }
        );
      } catch (e) {
        logger.warn(`[paypal.webhook] Could not update subscription record: ${e.message}`);
      }

    } else if (eventType === 'PAYMENT.SALE.COMPLETED') {
      // Recurring billing cycle payment succeeded — extend subscription period
      const subscriptionId = body.resource?.billing_agreement_id;
      if (subscriptionId) {
        logger.info(`[paypal.webhook] Recurring payment received for subscription ${subscriptionId}`);
        try {
          await Subscription.updateOne(
            { paypalSubscriptionId: subscriptionId },
            { $set: { status: 'active', lastPaymentAt: new Date() } }
          );
        } catch (e) {
          logger.warn(`[paypal.webhook] Could not update subscription after sale: ${e.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[paypal.webhook] Error processing ${eventType}: ${err.message}`);
  }

  res.json({ received: true });
}

module.exports = { handleWebhook };
