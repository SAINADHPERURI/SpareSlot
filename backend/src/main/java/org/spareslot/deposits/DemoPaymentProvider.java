package org.spareslot.deposits;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;

/** Demo payment: no real money moves. It only issues a reference so the ledger reads like a real one. */
@Component
public class DemoPaymentProvider implements PaymentProvider {

    private final SecureRandom random = new SecureRandom();

    @Override
    public Result charge(UUID bookingId, int amountMinor, String currency) {
        return new Result("demo", "DEMO-PAY-" + token());
    }

    @Override
    public Result refund(UUID bookingId, int amountMinor, String currency, String chargeReference) {
        return new Result("demo", "DEMO-REFUND-" + token());
    }

    private String token() {
        byte[] b = new byte[4];
        random.nextBytes(b);
        return HexFormat.of().withUpperCase().formatHex(b);
    }
}
