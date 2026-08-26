package where.am.i.mvp.server;

import where.am.i.mvp.entities.Company;
import where.am.i.mvp.entities.Role;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

// feeds the /company endpoints
public class CompanyRegistry {
    Map<String, Company> nameToCompany;
    Map<Company, Metadata> companyToMetadata;
    public CompanyRegistry() {
        this.nameToCompany = new HashMap<>();
        this.companyToMetadata = new HashMap<>();
    }

    public Company getOrThrow(String name) throws IOException {
        var company = nameToCompany.get(name.toLowerCase().trim());
        if (company == null) {
            throw new IOException("Company [%s] is not registered".formatted(name));
        }
        return company;
    }

    public boolean exists(String name) {
        return nameToCompany.containsKey(name.toLowerCase().trim());
    }

    public void newCompany(String name) {
        if (exists(name)) {
            return;
        }
        String normalizedName = name.toLowerCase().trim();
        var company = new Company(normalizedName);
        nameToCompany.put(normalizedName, company);
        companyToMetadata.put(company, new Metadata());
    }

    // TODO: flesh out
    // TODO: not thread safe
    private static class Metadata {
        Map<Role, Integer> rolesToActiveApplicants;
        public Metadata() {
            this.rolesToActiveApplicants = new HashMap<>();
        }
    }
}
