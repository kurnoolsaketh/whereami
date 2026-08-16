package where.am.i.mvp.entities;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Objects;

public class Job {
    String title;
    String company; // TODO: make a separate entity for company
    String description;
    String reqId;
    String jobId;
    URL url;

    public Job(String title, String company, String description, String reqId, URL url) throws NoSuchAlgorithmException {
        this.title = title;
        this.company = company;
        this.description = description;
        this.reqId = reqId;
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        this.jobId = bytesToHex(hash.digest((title + company + description + reqId).getBytes(StandardCharsets.UTF_8)));
        this.url = url;
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

    public String getId() {
        return jobId;
    }
    public String getTitle() {
        return title;
    }
    public String getCompany() {
        return company;
    }
    public String getDescription() {
        return description;
    }
    public String getReqId() {
        return reqId;
    }
    public URL getUrl() {
        return url;
    }

    //TODO: equals is overridden without hashCode, but Job is used as a HashMap key and inside
    // HashSets. Two equal Jobs land in different buckets. This only works today because
    // JobRegistry hands out one instance per job.
    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Job other)) {
            return false;
        }

        return Objects.equals(this.jobId, other.jobId);
    }
}
