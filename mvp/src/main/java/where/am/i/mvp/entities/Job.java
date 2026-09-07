package where.am.i.mvp.entities;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public record Job(String title, Company company, URL url, Role role, boolean active) {

    // a MessageDigest carries the bytes fed to it so far, so it cannot be shared: the server
    // computes ids on tomcat's request threads, and two of them digesting at once interleaved
    // their update() and digest() calls and handed both callers the hash of the two jobs run
    // together. one instance per call is the whole fix - it is a cheap object, and an id is a
    // pure function of the record's fields either way
    public String getId() {
        return bytesToHex(digest().digest((title + company + url.toString() + role.toString()).getBytes(StandardCharsets.UTF_8)));
    }

    private static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    private static String bytesToHex(byte[] hash) {
        StringBuilder hexString = new StringBuilder(2 * hash.length);
        for (int i = 0; i < hash.length; i++) {
            String hex = Integer.toHexString(0xff & hash[i]);
            if(hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
