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
public class RolesControllerTest {

    // roles travel as display names, so they carry a space and have to be url-encoded in a path.
    // passing them as uri variables lets MockMvc do that encoding
    private static final String SWE = "Software Engineer";
    private static final String PM = "Product Manager";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    private String createJob(String title, String company, String role) throws Exception {
        String response = mockMvc.perform(post("/api/jobs/%s/new".formatted(company))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "%s", "url": "https://%s.example/%s", "role": "%s"}"""
                                .formatted(title, company, title, role)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("jobId").asString();
    }

    private void createUser(String userId) throws Exception {
        mockMvc.perform(post("/api/users")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "yo", "lastName": "mama", "userId": "%s"}"""
                                .formatted(userId)))
                .andExpect(status().isOk());
    }

    private void apply(String userId, String jobId, String level) throws Exception {
        mockMvc.perform(post("/api/users/%s/apply".formatted(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"jobId": "%s", "level": "%s"}""".formatted(jobId, level)))
                .andExpect(status().isOk());
    }

    // GET /api/roles

    @Test
    public void testListAllRoles() throws Exception {
        mockMvc.perform(get("/api/roles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0]").value("Software Engineer"))
                .andExpect(jsonPath("$[1]").value("Product Manager"))
                .andExpect(jsonPath("$[2]").value("Internship"))
                .andExpect(jsonPath("$[3]").value("Engineering Manager"));
    }

    // GET /api/roles/{company}

    @Test
    public void testRolesForCompanyAreDeduplicatedAndSorted() throws Exception {
        createJob("swe", "bumco", SWE);
        createJob("swe2", "bumco", SWE);              // same role, collapses into one
        createJob("pm", "bumco", PM);
        createJob("intern", "acme", "Internship");    // other company, excluded

        mockMvc.perform(get("/api/roles/bumco"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0]").value("Product Manager"))
                .andExpect(jsonPath("$[1]").value("Software Engineer"));
    }

    @Test
    public void testRolesForUnknownCompany() throws Exception {
        mockMvc.perform(get("/api/roles/ghost"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Company [ghost] is not registered"));
    }

    // GET /api/roles/{role}/jobs

    @Test
    public void testJobsForRoleIsEmptyBeforeAnyAreCreated() throws Exception {
        mockMvc.perform(get("/api/roles/{role}/jobs", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testJobsForRoleSpansCompaniesAndExcludesOtherRoles() throws Exception {
        createJob("swe", "zebra", SWE);
        createJob("designer", "acme", SWE);
        createJob("tpm", "acme", PM);                 // other role, excluded

        mockMvc.perform(get("/api/roles/{role}/jobs", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].company").value("acme"))
                .andExpect(jsonPath("$[0].title").value("designer"))
                .andExpect(jsonPath("$[0].role").value("Software Engineer"))
                .andExpect(jsonPath("$[0].url").value("https://acme.example/designer"))
                .andExpect(jsonPath("$[1].company").value("zebra"))
                .andExpect(jsonPath("$[1].title").value("swe"));
    }

    @Test
    public void testJobsForUnknownRole() throws Exception {
        mockMvc.perform(get("/api/roles/{role}/jobs", "Chief Vibes Officer"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("role [Chief Vibes Officer] not found"));
    }

    // GET /api/roles/{company}/{role}/applicants

    @Test
    public void testApplicantsIsEmptyBeforeAnyoneApplies() throws Exception {
        createJob("swe", "bumco", SWE);

        mockMvc.perform(get("/api/roles/{company}/{role}/applicants", "bumco", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    public void testApplicantsAreSortedByUserIdAndCarryTheirLevel() throws Exception {
        String swe = createJob("swe", "bumco", SWE);
        String pm = createJob("pm", "bumco", PM);
        createUser("zeta");
        createUser("alpha");
        createUser("mallory");
        apply("zeta", swe, "Senior");
        apply("alpha", swe, "Junior");
        apply("mallory", pm, "Staff");     // other role at the same company, excluded

        mockMvc.perform(get("/api/roles/{company}/{role}/applicants", "bumco", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].user.userId").value("alpha"))
                .andExpect(jsonPath("$[0].user.firstName").value("yo"))
                .andExpect(jsonPath("$[0].pipeline.level").value("Junior"))
                .andExpect(jsonPath("$[0].pipeline.stages.length()").value(1))
                .andExpect(jsonPath("$[0].pipeline.stages[0]").value("APPLIED"))
                .andExpect(jsonPath("$[0].pipeline.currentStagePosition").value(0))
                .andExpect(jsonPath("$[1].user.userId").value("zeta"))
                .andExpect(jsonPath("$[1].pipeline.level").value("Senior"));
    }

    @Test
    public void testApplicantsExcludeOtherCompanies() throws Exception {
        String here = createJob("swe", "bumco", SWE);
        String elsewhere = createJob("swe", "acme", SWE);
        createUser("alpha");
        createUser("zeta");
        apply("alpha", here, "Mid");
        apply("zeta", elsewhere, "Mid");

        mockMvc.perform(get("/api/roles/{company}/{role}/applicants", "bumco", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].user.userId").value("alpha"));
    }

    @Test
    public void testApplicantsReflectStageUpdates() throws Exception {
        String swe = createJob("swe", "bumco", SWE);
        createUser("zeta");
        apply("zeta", swe, "Senior");

        mockMvc.perform(put("/api/users/zeta/applied/%s/updateStages".formatted(swe))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stages": ["APPLIED", "TECHNICAL_ROUND", "TECHNICAL_ROUND", "ONSITE"],
                                 "currentStagePosition": 2}"""))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/roles/{company}/{role}/applicants", "bumco", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].pipeline.stages.length()").value(4))
                .andExpect(jsonPath("$[0].pipeline.stages[2]").value("TECHNICAL_ROUND"))
                .andExpect(jsonPath("$[0].pipeline.currentStagePosition").value(2));
    }

    @Test
    public void testApplicantsForUnknownCompany() throws Exception {
        String swe = createJob("swe", "bumco", SWE);
        createUser("alpha");
        apply("alpha", swe, "None");

        mockMvc.perform(get("/api/roles/{company}/{role}/applicants", "ghost", SWE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Company [ghost] is not registered"));
    }

    // the company lookup sits behind a role check inside the applicant loop, so with no
    // applicants to iterate an unregistered company is never noticed and the list comes back
    // empty rather than rejected
    @Test
    public void testApplicantsForUnknownCompanyIsEmptyWhenNobodyHasApplied() throws Exception {
        mockMvc.perform(get("/api/roles/{company}/{role}/applicants", "ghost", SWE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }
}
