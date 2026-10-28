package org.spareslot.deposits;

import java.util.UUID;

/**
 * Moves deposit money. This build ships only {@link DemoPaymentProvider}, which moves no real money.
 * Implementations must never return or store card, UPI or bank details: only a provider name and a reference.
 */
public interface PaymentProvider {

    record Result(String provider, String reference) {}

    Result charge(UUID bookingId, int amountMinor, String currency);

    Result refund(UUID bookingId, int amountMinor, String currency, String chargeReference);
}
