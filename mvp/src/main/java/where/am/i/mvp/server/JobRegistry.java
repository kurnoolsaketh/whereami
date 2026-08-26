package where.am.i.mvp.server;

import where.am.i.mvp.entities.Company;
import where.am.i.mvp.entities.Job;
import where.am.i.mvp.entities.Role;

import java.io.IOException;
import java.net.URL;
import java.util.*;
import java.util.stream.Collectors;

// TODO: should go in a database
public class JobRegistry {
    HashMap<String, Job> jobIdToJob;

    public JobRegistry() {
        this.jobIdToJob = new HashMap<>();
    }

    public Job createJob(String title,
                            Company company,
                            URL url,
                            Role role) {
        Job job = new Job(title, company, url, role, true);
        jobIdToJob.put(job.getId(), job);
        return job;
    }

    public Job getJob(String jobId) throws IOException {
        //TODO: the message says 64 bytes, but a job id is 64 hex characters, which is 32 bytes.
        if (jobId.length() != 64) {
            throw new IOException("Job id [%s] is malformed - it must be 64 bytes".formatted(jobId));
        }
        if (!jobIdToJob.containsKey(jobId)) {
            throw new IOException("Job [%s] does not exist".formatted(jobId));
        }
        return jobIdToJob.get(jobId);
    }

    public Set<Job> listJobs(Company company) {
        return jobIdToJob.values().stream().filter(job -> job.company().equals(company)).collect(Collectors.toSet());
    }

    public Set<Job> listJobsForRole(Role role) {
        return jobIdToJob.values().stream().filter(job -> job.role().equals(role)).collect(Collectors.toSet());
    }

    public Set<Job> listJobsForRoleAndCompany(Company company, Role role) {
        return jobIdToJob.values().stream().filter(job -> job.company().equals(company)).filter(job -> job.role().equals(role)).collect(Collectors.toSet());
    }

    public Set<Company> listCompanies() {
        return jobIdToJob.values().stream().map(Job::company).collect(Collectors.toSet());
    }
}
