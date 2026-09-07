package where.am.i.mvp.entities;

import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class JobTest {

    private static Job job(String title) throws Exception {
        return new Job(title, new Company("bugco"), URI.create("https://bugco.example/" + title.replace(' ', '-')).toURL(), Role.SOFTWARE_ENGINEER, true);
    }

    // a job's id is a pure function of its fields, so two calls must agree - but the server
    // computes ids on tomcat's request threads, and the applied screen loads by firing
    // GET /jobs/{id} and GET /users/{id}/applied together. two jobs digesting at once used to
    // interleave on one shared MessageDigest and hand both callers a hash of the two titles
    // run together, which no job has: the screen then failed to match its own posting in the
    // list and told the user they had never applied
    @Test
    void computesTheSameIdUnderConcurrentCalls() throws Exception {
        List<Job> jobs = List.of(job("Backend Engineer"), job("Frontend Engineer"), job("Data Engineer"));
        List<String> expected = jobs.stream().map(Job::getId).toList();

        int rounds = 500;
        try (ExecutorService threads = Executors.newFixedThreadPool(jobs.size())) {
            for (int round = 0; round < rounds; round++) {
                List<Callable<String>> calls = jobs.stream().map(job -> (Callable<String>) job::getId).toList();
                List<String> ids = threads.invokeAll(calls).stream().map(JobTest::get).toList();
                assertEquals(expected, ids, "ids differ from the single-threaded ones on round " + round);
            }
        }
    }

    // and no two distinct jobs may ever collide, which an interleaved digest also caused:
    // one thread's update landing in another's digest gives both the same wrong hash
    @Test
    void givesDistinctJobsDistinctIds() throws Exception {
        List<Job> jobs = IntStream.range(0, 8).mapToObj(i -> {
            try {
                return job("Engineer-" + i);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }).toList();

        Set<String> ids = jobs.stream().map(Job::getId).collect(Collectors.toSet());
        assertEquals(jobs.size(), ids.size());
    }

    private static String get(Future<String> future) {
        try {
            return future.get();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
