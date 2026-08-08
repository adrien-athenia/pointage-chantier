import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

export function NotFoundPage() {
  return (
    <div className="page">
      <Card>
        <EmptyState
          icon={Compass}
          title="Page introuvable"
          description="Cette page n'existe pas ou vous n'y avez pas accès."
          action={
            <Link to="/login">
              <Button variant="secondary">Retour à l'accueil</Button>
            </Link>
          }
        />
      </Card>
    </div>
  )
}
