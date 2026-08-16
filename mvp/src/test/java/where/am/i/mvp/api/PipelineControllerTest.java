package where.am.i.mvp.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// the registries are in-memory singletons, so each test gets a fresh context
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
public class PipelineControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    String jobId;

    @BeforeEach
    public void setup() throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "yo", "lastName": "mama", "userId": "bruh2000"}"""))
                .andExpect(status().isOk());
        jobId = createJob("swe", "bumco");
    }

    private String createJob(String title, String company) throws Exception {
        String response = mockMvc.perform(post("/api/jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "%s", "company": "%s", "description": "yo mama", "reqId": "1234", "url": "https://bumco.example/jobs/1234"}"""
                                .formatted(title, company)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("jobId").asString();
    }

    private void apply(String userId, String jobId) throws Exception {
        mockMvc.perform(post("/api/users/%s/applications".formatted(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s"}""".formatted(jobId)))
                .andExpect(status().isOk());
    }

    @Test
    public void testApplicationsIsEmptyBeforeApplying() throws Exception {
        mockMvc.perform(get("/api/users/bruh2000/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testApplicationsForUnknownUser() throws Exception {
        mockMvc.perform(get("/api/users/nobody/applications"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No user found with id nobody"));
    }

    @Test
    public void testApplyStartsAtApplied() throws Exception {
        mockMvc.perform(post("/api/users/bruh2000/applications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s"}""".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.job.jobId").value(jobId))
                .andExpect(jsonPath("$.pipeline.stages.length()").value(1))
                .andExpect(jsonPath("$.pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(0));

        mockMvc.perform(get("/api/users/bruh2000/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].job.jobId").value(jobId))
                .andExpect(jsonPath("$[0].job.title").value("swe"))
                .andExpect(jsonPath("$[0].pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$[0].pipeline.currentStagePosition").value(0));
    }

    @Test
    public void testApplyToUnknownJob() throws Exception {
        mockMvc.perform(post("/api/users/bruh2000/applications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s"}""".formatted("x".repeat(64))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Job [%s] does not exist".formatted("x".repeat(64))));
    }

    @Test
    public void testApplicationsSortByCompanyThenTitle() throws Exception {
        apply("bruh2000", createJob("swe", "zebra"));
        apply("bruh2000", createJob("tpm", "acme"));
        apply("bruh2000", createJob("designer", "acme"));

        mockMvc.perform(get("/api/users/bruh2000/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].job.company").value("acme"))
                .andExpect(jsonPath("$[0].job.title").value("designer"))
                .andExpect(jsonPath("$[1].job.company").value("acme"))
                .andExpect(jsonPath("$[1].job.title").value("tpm"))
                .andExpect(jsonPath("$[2].job.company").value("zebra"))
                .andExpect(jsonPath("$[2].job.title").value("swe"));
    }

    @Test
    public void testWithdraw() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(delete("/api/users/bruh2000/applications/" + jobId))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/users/bruh2000/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testUpdateStages() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applications/%s/stages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "TECHNICAL_ROUND", "TECHNICAL_ROUND", "OFFER"],
                                 "currentStagePosition": 2}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.stages.length()").value(4))
                .andExpect(jsonPath("$.pipeline.stages[1]").value("TECHNICAL_ROUND"))
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(2));
    }

    @Test
    public void testUpdateStagesRejectsListNotStartingWithApplied() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applications/%s/stages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["ONSITE", "OFFER"], "currentStagePosition": 0}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("First stage must be [APPLIED]. Actual: [ONSITE]"));

        mockMvc.perform(get("/api/users/bruh2000/applications"))
                .andExpect(jsonPath("$[0].pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$[0].pipeline.stages.length()").value(1));
    }

    @Test
    public void testUpdateStagesRejectsPositionPastTheNewList() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(put("/api/users/bruh2000/applications/%s/stages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "OFFER"], "currentStagePosition": 5}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid position [5] - max [1]"));
    }

    @Test
    public void testMoveToStage() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "OFFER");

        mockMvc.perform(put("/api/users/bruh2000/applications/%s/position".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentStagePosition": 2}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(2))
                .andExpect(jsonPath("$.pipeline.stages.length()").value(3));
    }

    @Test
    public void testMoveToStagePastTheList() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "OFFER");

        mockMvc.perform(put("/api/users/bruh2000/applications/%s/position".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"currentStagePosition": 3}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid position [3] - max [2]"));
    }

    @Test
    public void testMoveToNextStage() throws Exception {
        apply("bruh2000", jobId);
        setStages("APPLIED", "TECHNICAL_ROUND", "OFFER");

        mockMvc.perform(post("/api/users/bruh2000/applications/%s/next".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(1));

        mockMvc.perform(post("/api/users/bruh2000/applications/%s/next".formatted(jobId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pipeline.currentStagePosition").value(2));
    }

    @Test
    public void testMoveToNextStagePastTheLastOne() throws Exception {
        apply("bruh2000", jobId);

        mockMvc.perform(post("/api/users/bruh2000/applications/%s/next".formatted(jobId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid position [1] - max [0]"));
    }

    @Test
    public void testMovingAJobTheUserNeverAppliedTo() throws Exception {
        mockMvc.perform(post("/api/users/bruh2000/applications/%s/next".formatted(jobId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("User has not applied to the [swe] role at [bumco] or has been removed"));
    }

    private void setStages(String... stages) throws Exception {
        String quoted = String.join(", ", java.util.Arrays.stream(stages).map("\"%s\""::formatted).toList());
        mockMvc.perform(put("/api/users/bruh2000/applications/%s/stages".formatted(jobId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": [%s], "currentStagePosition": 0}""".formatted(quoted)))
                .andExpect(status().isOk());
    }
}
