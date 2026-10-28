package org.spareslot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SpareSlotApplication {
    public static void main(String[] args) {
        SpringApplication.run(SpareSlotApplication.class, args);
    }
}
