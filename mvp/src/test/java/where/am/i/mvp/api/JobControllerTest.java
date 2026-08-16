package where.am.i.mvp.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// the registries are in-memory singletons, so each test gets a fresh context
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
public class JobControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    private String createJob(String title, String company) throws Exception {
        String response = mockMvc.perform(post("/api/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "%s", "company": "%s", "description": "yo mama", "reqId": "1234"}"""
                                .formatted(title, company)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("jobId").asString();
    }

    @Test
    public void testCreateJob() throws Exception {
        mockMvc.perform(post("/api/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "swe", "company": "bumco", "description": "yo mama", "reqId": "1234"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").isString())
                .andExpect(jsonPath("$.title").value("swe"))
                .andExpect(jsonPath("$.company").value("bumco"))
                .andExpect(jsonPath("$.description").value("yo mama"))
                .andExpect(jsonPath("$.reqId").value("1234"));
    }

    @Test
    public void testCreateJobAlreadyExists() throws Exception {
        createJob("swe", "bumco");

        mockMvc.perform(post("/api/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "swe", "company": "bumco", "description": "yo mama", "reqId": "1234"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job already exists"));
    }

    @Test
    public void testGetJob() throws Exception {
        String jobId = createJob("swe", "bumco");

        mockMvc.perform(get("/api/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.title").value("swe"))
                .andExpect(jsonPath("$.company").value("bumco"));
    }

    @Test
    public void testGetJobNotExists() throws Exception {
        mockMvc.perform(get("/api/jobs/" + "x".repeat(64)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job [%s] does not exist".formatted("x".repeat(64))));
    }

    @Test
    public void testGetJobMalformedId() throws Exception {
        mockMvc.perform(get("/api/jobs/x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job id [x] is malformed - it must be 64 bytes"));
    }

    private void createUser(String userId) throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "yo", "lastName": "mama", "userId": "%s"}""".formatted(userId)))
                .andExpect(status().isOk());
    }

    private void apply(String userId, String jobId) throws Exception {
        mockMvc.perform(post("/api/users/%s/applications".formatted(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s"}""".formatted(jobId)))
                .andExpect(status().isOk());
    }

    @Test
    public void testApplicantsIsEmptyBeforeAnyoneApplies() throws Exception {
        String jobId = createJob("swe", "bumco");

        mockMvc.perform(get("/api/jobs/%s/applicants".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testApplicantsIncludesEveryoneSortedByUserId() throws Exception {
        String jobId = createJob("swe", "bumco");
        createUser("zeta");
        createUser("alpha");
        apply("zeta", jobId);
        apply("alpha", jobId);

        mockMvc.perform(put("/api/users/zeta/applications/%s/stages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "TECHNICAL_ROUND", "TECHNICAL_ROUND", "OFFER"],
                                 "currentStagePosition": 2}"""))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/jobs/%s/applicants".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].user.userId").value("alpha"))
                .andExpect(jsonPath("$[0].pipeline.stages.length()").value(1))
                .andExpect(jsonPath("$[0].pipeline.currentStagePosition").value(0))
                .andExpect(jsonPath("$[1].user.userId").value("zeta"))
                .andExpect(jsonPath("$[1].user.firstName").value("yo"))
                .andExpect(jsonPath("$[1].pipeline.stages.length()").value(4))
                .andExpect(jsonPath("$[1].pipeline.stages[2]").value("TECHNICAL_ROUND"))
                .andExpect(jsonPath("$[1].pipeline.currentStagePosition").value(2));
    }

    @Test
    public void testApplicantsForUnknownJob() throws Exception {
        mockMvc.perform(get("/api/jobs/%s/applicants".formatted("x".repeat(64))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job [%s] does not exist".formatted("x".repeat(64))));
    }

    @Test
    public void testListJobsIsEmptyBeforeAnyAreCreated() throws Exception {
        mockMvc.perform(get("/api/jobs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testListJobsSortsByCompanyThenTitle() throws Exception {
        createJob("swe", "zebra");
        createJob("tpm", "acme");
        createJob("designer", "acme");

        mockMvc.perform(get("/api/jobs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].company").value("acme"))
                .andExpect(jsonPath("$[0].title").value("designer"))
                .andExpect(jsonPath("$[1].company").value("acme"))
                .andExpect(jsonPath("$[1].title").value("tpm"))
                .andExpect(jsonPath("$[2].company").value("zebra"))
                .andExpect(jsonPath("$[2].title").value("swe"));
    }
}
