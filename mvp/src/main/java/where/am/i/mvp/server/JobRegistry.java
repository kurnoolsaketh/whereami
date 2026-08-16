package where.am.i.mvp.server;

import where.am.i.mvp.entities.Job;

import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;

// TODO: should go in a database
public class JobRegistry {
    HashMap<String, Job> jobIdToJob;

    public JobRegistry(PipelineService pipelineService) {
        this.jobIdToJob = new HashMap<>();
    }

    public String createJob(String title,
                          String company,
                          String description,
                          String reqId) throws NoSuchAlgorithmException, IOException {
        Job job = new Job(title, company, description, reqId);
        if (jobIdToJob.containsKey(job.getId())) {
            throw new IOException("Job already exists");
        }
        jobIdToJob.put(job.getId(), job);
        return job.getId();
    }

    public Job getJob(String jobId) throws IOException {
        if (jobId.length() != 64) {
            throw new IOException("Job id [%s] is malformed - it must be 64 bytes".formatted(jobId));
        }
        if (!jobIdToJob.containsKey(jobId)) {
            throw new IOException("Job [%s] does not exist".formatted(jobId));
        }
        return jobIdToJob.get(jobId);
    }
}
