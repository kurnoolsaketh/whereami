package where.am.i.mvp.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// no @DirtiesContext: the endpoint reads the enum and touches no registry, so there is no
// state for one test to leave behind for the next
@SpringBootTest
@AutoConfigureMockMvc
public class StatusControllerTest {

    @Autowired
    MockMvc mockMvc;

    // Status has no toString override, so unlike levels these travel as constant names. the
    // frontend titles them the same way it titles stages, and posts them back verbatim
    @Test
    public void testListStatusesInDeclarationOrder() throws Exception {
        mockMvc.perform(get("/api/statuses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0]").value("ACTIVE"))
                .andExpect(jsonPath("$[1]").value("USER_WITHDREW"))
                .andExpect(jsonPath("$[2]").value("OFFER"))
                .andExpect(jsonPath("$[3]").value("REJECTED"));
    }

    // OFFER moved out of Stage and into Status. asserting it is absent from the stage list is
    // what stops it quietly coming back and making an outcome look like a round to walk through
    @Test
    public void testStagesAndStatusesAreSeparateAxes() throws Exception {
        mockMvc.perform(get("/api/stages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(6))
                .andExpect(jsonPath("$[0]").value("APPLIED"))
                .andExpect(jsonPath("$[5]").value("ONSITE"))
                .andExpect(jsonPath("$[?(@ == 'OFFER')]").isEmpty());
    }
}
