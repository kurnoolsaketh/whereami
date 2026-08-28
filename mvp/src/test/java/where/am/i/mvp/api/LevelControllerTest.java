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
public class LevelControllerTest {

    @Autowired
    MockMvc mockMvc;

    // Level overrides toString, so the wire format is the display name. asserting the exact
    // strings is the point of the test - the frontend hands these straight back to /apply
    @Test
    public void testListLevelsInDeclarationOrder() throws Exception {
        mockMvc.perform(get("/api/levels"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[0]").value("None"))
                .andExpect(jsonPath("$[1]").value("Junior"))
                .andExpect(jsonPath("$[2]").value("Mid"))
                .andExpect(jsonPath("$[3]").value("Senior"))
                .andExpect(jsonPath("$[4]").value("Staff"))
                .andExpect(jsonPath("$[5]").value("Principal"))
                .andExpect(jsonPath("$[6]").value("Distinguished"));
    }
}
